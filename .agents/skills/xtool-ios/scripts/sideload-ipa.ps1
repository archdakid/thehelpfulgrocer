<#
.SYNOPSIS
    One-command helper to sign and sideload an iOS .ipa onto a USB-connected iPhone from Windows using xtool in WSL2 Ubuntu.

.DESCRIPTION
    1. Bridges Windows Apple Mobile Device Service (127.0.0.1:27015) into WSL2 /var/run/usbmuxd via connect-iphone-wsl.ps1.
    2. Verifies that an iPhone is connected via USB and trusted (`idevice_id -l`).
    3. Verifies that `xtool` is authenticated with Apple Developer Services (`xtool auth status`), or runs `xtool auth login`.
    4. Signs and installs the target `.ipa` onto the connected iPhone via `~/.local/bin/xtool install`.

.PARAMETER IpaPath
    Path to the unsigned or signed .ipa file on Windows (e.g. .\SmartShopper-unsigned.ipa).

.PARAMETER Distro
    WSL2 distribution name (defaults to Ubuntu).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$IpaPath = ".\SmartShopper-unsigned.ipa",

    [Parameter(Mandatory = $false)]
    [string]$Distro = "Ubuntu"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$connectScript = Join-Path $scriptDir "connect-iphone-wsl.ps1"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Helpful iOS Sideloader (Windows + WSL2 xtool 1.21.0)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Step 1: Ensure USB bridge to WSL2 is active
Write-Host "`n[1/4] Starting iPhone USB relay into WSL2 ($Distro)..." -ForegroundColor Yellow
& $connectScript -Mode Relay -Distro $Distro

# Step 2: Check connected iPhone
Write-Host "`n[2/4] Checking for USB-connected iPhone..." -ForegroundColor Yellow
$udids = wsl -d $Distro -- idevice_id -l 2>$null
if (-not $udids -or [string]::IsNullOrWhiteSpace($udids)) {
    Write-Host "No iPhone detected yet via idevice_id -l." -ForegroundColor Red
    Write-Host "Please ensure:" -ForegroundColor Yellow
    Write-Host "  1. Your iPhone is plugged into this PC via USB."
    Write-Host "  2. Your iPhone screen is unlocked and you tapped 'Trust This Computer'."
    Write-Host "  3. Developer Mode is enabled on iOS 16+ (Settings -> Privacy & Security -> Developer Mode)."
    exit 1
}
Write-Host "Detected iPhone UDID(s): $udids" -ForegroundColor Green

# Step 3: Check xtool Apple ID auth status
Write-Host "`n[3/4] Checking xtool Apple Developer authentication..." -ForegroundColor Yellow
$authStatus = wsl -d $Distro -- /home/chadj/.local/bin/xtool auth status 2>&1
Write-Host $authStatus
if ($LASTEXITCODE -ne 0 -or $authStatus -match "Not logged in|not authenticated") {
    Write-Host "xtool is not logged into an Apple ID yet. Launching interactive 'xtool auth login'..." -ForegroundColor Yellow
    wsl -d $Distro -- /home/chadj/.local/bin/xtool auth login
    if ($LASTEXITCODE -ne 0) {
        throw "xtool auth login failed."
    }
}

# Step 4: Resolve .ipa path and run xtool install
Write-Host "`n[4/4] Signing and installing IPA onto iPhone via xtool..." -ForegroundColor Yellow
if (-not (Test-Path $IpaPath)) {
    Write-Host "IPA file not found at: $IpaPath" -ForegroundColor Red
    Write-Host "To build SmartShopper-unsigned.ipa:" -ForegroundColor Yellow
    Write-Host "  - Push this branch to GitHub and trigger the 'Build Unsigned iOS IPA (for xtool Sideloading)' workflow in GitHub Actions, then download SmartShopper-unsigned.ipa."
    Write-Host "  - Or pass an existing .ipa path: .\sideload-ipa.ps1 -IpaPath C:\path\to\app.ipa"
    exit 1
}

$resolvedWinPath = (Resolve-Path $IpaPath).Path
$wslIpaPath = wsl -d $Distro -- wslpath -a ($resolvedWinPath -replace '\\', '/')
Write-Host "Installing $wslIpaPath ..." -ForegroundColor Cyan

wsl -d $Distro -- /home/chadj/.local/bin/xtool install "$wslIpaPath"
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully signed and installed onto your iPhone!" -ForegroundColor Green
    Write-Host "Note: On free Apple IDs, the first time you open the app on your iPhone, go to:" -ForegroundColor Yellow
    Write-Host "  Settings -> General -> VPN & Device Management -> [Your Apple ID] -> Trust" -ForegroundColor Yellow
} else {
    throw "xtool install exited with code $LASTEXITCODE"
}
