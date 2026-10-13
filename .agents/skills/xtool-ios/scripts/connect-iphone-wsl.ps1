<#
.SYNOPSIS
  Connects a physical iPhone over USB from Windows into WSL2 Ubuntu for xtool (`xtool devices`, `xtool install`, `xtool launch`).

.DESCRIPTION
  Supports two connection modes:
  1. Relay (Default): Uses the Windows Apple Mobile Device Service (AMDS, listening on 127.0.0.1:27015)
     and bridges it into WSL2 `/var/run/usbmuxd` via TCP port proxy + `socat`.
     This avoids `usbipd` driver conflicts and `AFCClient.Error.muxError` on Windows.
  2. Usbipd: Attaches the Apple Mobile Device USB Composite Device directly to WSL2 via `usbipd-win`
     and starts `usbmuxd` inside WSL2.

.PARAMETER Mode
  Connection mode: 'Auto' (default, prefers Relay if Apple Mobile Device Service is running), 'Relay', or 'Usbipd'.

.PARAMETER WslDistro
  WSL2 distribution name (default: 'Ubuntu').
#>
param(
    [ValidateSet('Auto', 'Relay', 'Usbipd')]
    [string]$Mode = 'Auto',

    [string]$WslDistro = 'Ubuntu',

    [int]$RelayPort = 27015
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host "=== SmartShopper iPhone -> WSL2 USB Connector ===" -ForegroundColor Cyan

$amds = Get-Service -Name 'Apple Mobile Device Service' -ErrorAction SilentlyContinue
$usbipdCmd = Get-Command usbipd -ErrorAction SilentlyContinue

if ($Mode -eq 'Auto') {
    if ($amds -and $amds.Status -eq 'Running') {
        $Mode = 'Relay'
        Write-Host "[Auto] Detected running 'Apple Mobile Device Service' on Windows -> using 'Relay' mode." -ForegroundColor Green
    } elseif ($usbipdCmd) {
        $Mode = 'Usbipd'
        Write-Host "[Auto] Detected 'usbipd' -> using 'Usbipd' mode." -ForegroundColor Green
    } else {
        Write-Error "Neither 'Apple Mobile Device Service' nor 'usbipd-win' was found. Install Apple Devices / iTunes or run: winget install --exact dorssel.usbipd-win"
    }
}

if ($Mode -eq 'Relay') {
    if (-not $amds) {
        Write-Error "'Apple Mobile Device Service' is not installed. Install Apple Devices or iTunes on Windows, or use -Mode Usbipd."
    }
    if ($amds.Status -ne 'Running') {
        Write-Host "Starting Apple Mobile Device Service..." -ForegroundColor Yellow
        Start-Service -Name 'Apple Mobile Device Service'
    }

    # Verify AMDS is listening on 127.0.0.1:27015
    $listening = Get-NetTCPConnection -LocalPort 27015 -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
        Write-Error "Apple Mobile Device Service is running, but nothing is listening on TCP port 27015."
    }
    Write-Host "Windows Apple Mobile Device Service is listening on 127.0.0.1:27015." -ForegroundColor Green

    # Get WSL2 host gateway IP (vEthernet WSL)
    $routeOut = (wsl -d $WslDistro -- ip route show default | Out-String).Trim()
    $wslHostIp = $null
    if ($routeOut -match 'via\s+(\d+\.\d+\.\d+\.\d+)') {
        $wslHostIp = $Matches[1]
    }
    if (-not $wslHostIp) {
        Write-Error "Could not determine WSL2 host IP from distro '$WslDistro' (output: $routeOut)."
    }
    Write-Host "WSL2 Host Gateway IP: $wslHostIp" -ForegroundColor Gray

    if (Test-Administrator) {
        Write-Host "Configuring Windows portproxy ($wslHostIp`:$RelayPort -> 127.0.0.1:27015)..." -ForegroundColor Cyan
        netsh interface portproxy delete v4tov4 listenaddress=$wslHostIp listenport=$RelayPort 2>$null | Out-Null
        netsh interface portproxy add v4tov4 listenaddress=$wslHostIp listenport=$RelayPort connectaddress=127.0.0.1 connectport=27015 | Out-Null

        $fwRuleName = "WSL2-usbmuxd-Relay-$RelayPort"
        if (-not (Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $wslHostIp -LocalPort $RelayPort | Out-Null
        }
    } else {
        $alreadyForwarding = Get-NetTCPConnection -LocalAddress $wslHostIp -LocalPort $RelayPort -State Listen -ErrorAction SilentlyContinue
        if ($alreadyForwarding) {
            Write-Host "TCP forwarder already listening on $wslHostIp`:$RelayPort." -ForegroundColor Green
        } else {
            Write-Host "Starting background TCP forwarder ($wslHostIp`:$RelayPort -> 127.0.0.1:27015)..." -ForegroundColor Yellow
            $forwarderCmd = @"
`$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('$wslHostIp'), $RelayPort)
`$listener.Start()
while (`$true) {
    `$client = `$listener.AcceptTcpClient()
    `$null = [System.Threading.Tasks.Task]::Run({
        try {
            `$upstream = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 27015)
            `$cStream = `$client.GetStream()
            `$uStream = `$upstream.GetStream()
            `$t1 = `$cStream.CopyToAsync(`$uStream)
            `$t2 = `$uStream.CopyToAsync(`$cStream)
            [System.Threading.Tasks.Task]::WaitAny(`$t1, `$t2)
        } catch {} finally {
            try { `$client.Close() } catch {}
            try { `$upstream.Close() } catch {}
        }
    })
}
"@
            $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($forwarderCmd))
            Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile", "-EncodedCommand", $encoded | Out-Null
            Start-Sleep -Milliseconds 600
        }
    }

    Write-Host "Starting socat UNIX socket relay (/var/run/usbmuxd -> $wslHostIp`:$RelayPort) inside WSL2..." -ForegroundColor Cyan
    $wslCmd = "pkill -f 'socat UNIX-LISTEN:/var/run/usbmuxd' 2>/dev/null || true; pkill -x usbmuxd 2>/dev/null || true; mkdir -p /var/run; rm -f /var/run/usbmuxd; nohup socat UNIX-LISTEN:/var/run/usbmuxd,fork,mode=666 TCP:${wslHostIp}:${RelayPort} >/tmp/usbmuxd-socat.log 2>&1 & sleep 1; ls -la /var/run/usbmuxd"
    wsl -d $WslDistro -u root -- sh -c $wslCmd

    Write-Host "`nChecking connected iOS devices inside WSL2..." -ForegroundColor Cyan
    wsl -d $WslDistro -- sh -c 'export PATH="$HOME/.local/bin:$PATH"; idevice_id -l || true; xtool devices || true'
}
elseif ($Mode -eq 'Usbipd') {
    if (-not $usbipdCmd) {
        Write-Error "usbipd-win is not installed. Run: winget install --interactive --exact dorssel.usbipd-win"
    }
    $usbList = usbipd list
    Write-Host $usbList
    $appleLine = $usbList -split "`r?`n" | Where-Object { $_ -match '05ac:' -or $_ -match 'Apple Mobile Device' } | Select-Object -First 1
    if (-not $appleLine) {
        Write-Error "No Apple Mobile Device (VID 05ac) found in 'usbipd list'. Make sure your iPhone is plugged in via USB and unlocked."
    }
    $busId = ($appleLine -split '\s+')[0]
    Write-Host "Found Apple device on BUSID: $busId" -ForegroundColor Green

    if (Test-Administrator) {
        usbipd bind --busid $busId
    }
    usbipd attach --wsl --busid $busId

    Write-Host "Starting usbmuxd daemon inside WSL2..." -ForegroundColor Cyan
    wsl -d $WslDistro -u root -- sh -c "pkill -f 'socat UNIX-LISTEN:/var/run/usbmuxd' 2>/dev/null || true; pkill -x usbmuxd 2>/dev/null || true; rm -f /var/run/usbmuxd; usbmuxd"
    Start-Sleep -Seconds 1
    wsl -d $WslDistro -- sh -c 'export PATH="$HOME/.local/bin:$PATH"; idevice_id -l || true; xtool devices || true'
}
