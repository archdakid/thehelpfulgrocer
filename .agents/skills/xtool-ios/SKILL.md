---
name: xtool-ios
description: >-
  Build, sign, and deploy iOS apps natively from Windows (via WSL2) or Linux
  using xtool (https://github.com/xtool-org/xtool). Use this skill when setting
  up xtool in WSL2, configuring USB passthrough (usbipd / usbmuxd / iTunes mux),
  authenticating with Apple Developer Services (free or paid Apple ID), signing
  and sideloading custom Expo/React Native iOS development client IPAs onto a
  physical iPhone, or building SwiftPM iOS packages and extensions with xtool.
---

# xtool iOS Development & Sideloading on Windows (WSL2)

`xtool` (`https://github.com/xtool-org/xtool`) is an open-source, cross-platform Xcode replacement that runs on Linux and Windows (via WSL2). It provides two major capabilities:
1. **`XKit` (Signing, Provisioning, & Device Installation)**: Authenticates with Apple Developer Services (`GrandSlam` + `DeveloperServices`), automatically manages certificates/App IDs/provisioning profiles (even with a **free Apple ID**), signs `.app`/`.ipa` bundles, and installs them onto USB-connected iPhones via `usbmuxd`.
2. **`PackLib` (SwiftPM iOS Builder)**: Cross-compiles pure `Package.swift` targets into iOS `.app`/`.ipa` bundles using the Swift 6.4 Linux toolchain and a Darwin Swift SDK (`darwin.xtoolsdk`).

---

## How `xtool` Integrates with SmartShopper (Expo / React Native on Windows)

### Important Architectural Distinction
- **Why `xtool dev` does not compile `mobile/ios` directly**: `npx expo prebuild --platform ios` generates a CocoaPods `.xcworkspace` containing Objective-C, C++, and `.xcodeproj` targets (`react-native`, `react-native-vision-camera`, etc.). `xtool dev build` only compiles pure Swift Package Manager (`Package.swift`) projects.
- **How `xtool` solves our Windows → iPhone testing bottleneck**:
  Normally, testing a custom Expo Development Client on a physical iPhone without a Mac requires a **$99/yr paid Apple Developer Program account** because EAS Build cannot provision physical iOS devices on a free Apple ID.
  With `xtool` in WSL2 on Windows:
  1. **Compile an unsigned iOS Dev Client `.ipa`/`.app` in the cloud for free**:
     - **Option A (GitHub Actions `macos-latest` — Free 2,000 mins/mo)**: Run `npx expo prebuild --platform ios` and `xcodebuild` with `CODE_SIGNING_ALLOWED=NO` to produce an unsigned `SmartShopper.ipa` artifact.
     - **Option B (EAS Build)**: Build an internal/dev artifact via `eas build --platform ios`.
  2. **Sign & Install Locally on Windows via `xtool install` (Free Apple ID supported)**:
     - Download the unsigned `.ipa` to your Windows machine.
     - Connect your iPhone via USB and forward it to WSL2 (`usbipd` or iTunes TCP usbmux relay).
     - Run `xtool install SmartShopper.ipa` inside WSL2. `xtool` signs the `.ipa` with your free Apple ID certificate + auto-generated provisioning profile (prefixing the bundle ID as `XTL-<team>.<bundleID>`), and installs it directly onto your iPhone!
  3. **Live Development from Windows**:
     - Run `npx expo start --dev-client` in `mobile/` on Windows.
     - Launch the installed `SmartShopper` Dev Client on your iPhone — it connects over LAN/USB to your Windows Metro bundler with full native camera (`react-native-vision-camera`), barcode scanning, and Reanimated support!

---

## Verified Machine Environment (`ChadsLaptop`)

- **WSL2 Distribution**: `Ubuntu 24.04.4 LTS` (`Linux ChadsLaptop 6.6.87.2-microsoft-standard-WSL2 x86_64`)
- **WSL2 User**: `chadj` (Note: `sudo` inside WSL2 prompts for a password; root commands from Windows PowerShell can run directly via `wsl -d Ubuntu -u root -- <cmd>`)
- **Installed `xtool` Version**: `xtool 1.21.0`
  - **Binary Symlink**: `/home/chadj/.local/bin/xtool`
  - **Extracted AppImage Root**: `/home/chadj/.local/share/xtool/squashfs-root/AppRun` (extracted via `--appimage-extract` from `xtool-x86_64.AppImage` so FUSE mounting is not required at runtime)
- **Installed WSL2 USB/Device Packages**:
  - `usbmuxd` (`/usr/sbin/usbmuxd`, `1.1.1-5~exp3ubuntu2.1`)
  - `libimobiledevice-utils` (`/usr/bin/ideviceinfo`, `/usr/bin/idevice_id`, `1.3.0-8.1build3`)
  - `socat` (`/usr/bin/socat`, `1.8.0.0-4ubuntu0.1`)
  - `zip` (`/usr/bin/zip`), `unzip` (`/usr/bin/unzip`), `curl` (`/usr/bin/curl`), `libfuse2t64`
- **Windows Host USB Configuration**:
  - **`Apple Mobile Device Service` (AMDS)**: **Installed and Running** on Windows, listening on `127.0.0.1:27015`.
  - **`usbipd-win`**: Not currently installed (`Relay` mode via AMDS `127.0.0.1:27015` is the default and recommended method on this machine).
- **Helper Scripts**:
  - [`.agents/skills/xtool-ios/scripts/wsl-setup-xtool.sh`](file:///c:/Users/chadj/OneDrive/Desktop/helpful/.agents/skills/xtool-ios/scripts/wsl-setup-xtool.sh): Idempotent WSL2 Ubuntu setup script for `usbmuxd`, `libimobiledevice-utils`, `socat`, and `xtool` (`--with-swift` optional flag for `swiftly`).
  - [`.agents/skills/xtool-ios/scripts/connect-iphone-wsl.ps1`](file:///c:/Users/chadj/OneDrive/Desktop/helpful/.agents/skills/xtool-ios/scripts/connect-iphone-wsl.ps1): PowerShell helper that bridges Windows `Apple Mobile Device Service` (`127.0.0.1:27015`) to WSL2 `/var/run/usbmuxd` via `socat` (or attaches via `usbipd` if `-Mode Usbipd` is specified).

---

## Step-by-Step WSL2 Setup Runbook

### 1. Run the Automated WSL2 Setup Script
From PowerShell in the repo root:
```powershell
wsl -d Ubuntu -- bash /mnt/c/Users/chadj/OneDrive/Desktop/helpful/.agents/skills/xtool-ios/scripts/wsl-setup-xtool.sh
```
Or manually inside WSL2 (`wsl -d Ubuntu`):
```bash
# Install apt dependencies (from PowerShell if sudo prompts for password):
# wsl -d Ubuntu -u root -- apt-get update && wsl -d Ubuntu -u root -- apt-get install -y curl git unzip zip usbmuxd libimobiledevice-utils libimobiledevice6 socat libfuse2t64

# Download and extract prebuilt xtool v1.21.0 AppImage into ~/.local/bin/xtool:
mkdir -p ~/.local/share/xtool ~/.local/bin
cd ~/.local/share/xtool
curl -fLO https://github.com/xtool-org/xtool/releases/download/1.21.0/xtool-x86_64.AppImage
chmod +x xtool-x86_64.AppImage
./xtool-x86_64.AppImage --appimage-extract
ln -sf ~/.local/share/xtool/squashfs-root/AppRun ~/.local/bin/xtool
~/.local/bin/xtool --version
```

### 2. Optional: Install Swift 6.4 Toolchain in WSL2 (Only needed for `xtool dev` SwiftPM compilation)
> [!NOTE]
> Signing and sideloading an unsigned Expo `.ipa` (`xtool auth`, `xtool devices`, `xtool install`) only requires the prebuilt `xtool` AppImage above — the Swift compiler is **not** required for `.ipa` sideloading.

To install Swift via `swiftly`:
```bash
bash /mnt/c/Users/chadj/OneDrive/Desktop/helpful/.agents/skills/xtool-ios/scripts/wsl-setup-xtool.sh --with-swift
```

### 3. Connect Physical iPhone to WSL2 over USB

#### Method A (Recommended on this machine): Windows Apple Mobile Device Service Relay (`connect-iphone-wsl.ps1`)
Because `Apple Mobile Device Service` is already running on Windows and listening on `127.0.0.1:27015`, you do not need `usbipd-win` (and this avoids `AFCClient.Error.muxError` — see `xtool` Issue #19).
Note that AMDS binds to Windows loopback (`127.0.0.1:27015`), so our helper script forwards the WSL2 gateway IP (`vEthernet (WSL)`, e.g. `172.19.192.1:27015`) to `127.0.0.1:27015` on Windows and starts `socat` inside WSL2 on `/var/run/usbmuxd`:

```powershell
powershell -ExecutionPolicy Bypass -File .\.agents\skills\xtool-ios\scripts\connect-iphone-wsl.ps1
```

#### Method B: `usbipd-win` (Standard Microsoft USB Passthrough)
1. In an **Administrator PowerShell** on Windows:
   ```powershell
   winget install --interactive --exact dorssel.usbipd-win
   powershell -ExecutionPolicy Bypass -File .\.agents\skills\xtool-ios\scripts\connect-iphone-wsl.ps1 -Mode Usbipd
   ```
2. Or manually inside WSL2:
   ```bash
   wsl -d Ubuntu -u root -- usbmuxd
   wsl -d Ubuntu -- ~/.local/bin/xtool devices
   ```

---

## Core `xtool` Commands Reference

| Command | Description |
|---|---|
| `xtool auth` | Authenticate with your Apple ID (supports 2FA; works with free Apple IDs or paid Developer accounts). |
| `xtool devices` | List connected iOS devices visible via `usbmuxd`. |
| `xtool install <path.ipa>` | Automatically provision, sign, and install an `.ipa` or `.app` bundle onto your connected iOS device. |
| `xtool launch <bundleID>` | Launch an installed app on the connected iOS device. |
| `xtool uninstall <bundleID>` | Uninstall an app from the connected iOS device. |
| `xtool ds teams` / `certificates` / `profiles` / `devices` / `identifiers` | Inspect and manage Apple Developer Services resources directly from CLI. |
| `xtool setup` | Authenticate with Apple and install the Darwin iOS SDK (`darwin.xtoolsdk`) for SwiftPM compilation. |
| `xtool new <AppName>` | Scaffold a new SwiftPM iOS app with `Package.swift` and `xtool.yml`. |
| `xtool dev` | Build, sign, and deploy a SwiftPM iOS app (`Package.swift` + `xtool.yml`) to a connected device. |

---

## First-Time Device Trust on iOS
After `xtool install` succeeds on a free Apple ID:
1. On your iPhone, open **Settings → General → VPN & Device Management**.
2. Tap your Apple ID under **Developer App** and tap **Trust**.
3. Ensure **Developer Mode** is enabled under **Settings → Privacy & Security → Developer Mode** (iOS 16+).
