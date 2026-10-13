#!/usr/bin/env bash
# Idempotent setup script for xtool and iOS USB tools inside WSL2 Ubuntu (24.04 LTS)
# Usage:
#   bash .agents/skills/xtool-ios/scripts/wsl-setup-xtool.sh [--with-swift]

set -euo pipefail

WITH_SWIFT=false
for arg in "$@"; do
  case "$arg" in
    --with-swift)
      WITH_SWIFT=true
      ;;
  esac
done

echo "=== [1/4] Checking WSL2 Ubuntu Environment ==="
uname -a
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo "Distribution: ${PRETTY_NAME:-Ubuntu}"
fi

echo "=== [2/4] Checking System Prerequisites (usbmuxd, libimobiledevice-utils, socat, zip, libfuse2) ==="
MISSING_PKGS=()
for cmd_pkg in "usbmuxd:usbmuxd" "ideviceinfo:libimobiledevice-utils" "socat:socat" "curl:curl" "unzip:unzip" "zip:zip"; do
  cmd="${cmd_pkg%%:*}"
  pkg="${cmd_pkg##*:}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING_PKGS+=("$pkg")
  fi
done

if ! dpkg -s libfuse2t64 >/dev/null 2>&1 && ! dpkg -s libfuse2 >/dev/null 2>&1; then
  MISSING_PKGS+=("libfuse2t64")
fi

if [ "${#MISSING_PKGS[@]}" -gt 0 ]; then
  echo "Installing missing packages: ${MISSING_PKGS[*]}"
  if [ "$(id -u)" -eq 0 ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq "${MISSING_PKGS[@]}"
  elif sudo -n true 2>/dev/null; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${MISSING_PKGS[@]}"
  else
    echo "NOTE: sudo requires a password. Run from Windows PowerShell as root if needed:"
    echo "  wsl -d Ubuntu -u root -- apt-get update && wsl -d Ubuntu -u root -- apt-get install -y ${MISSING_PKGS[*]}"
    sudo apt-get update
    sudo apt-get install -y "${MISSING_PKGS[@]}"
  fi
else
  echo "All apt packages already installed:"
  echo "  - usbmuxd:     $(command -v usbmuxd)"
  echo "  - ideviceinfo: $(command -v ideviceinfo)"
  echo "  - socat:       $(command -v socat)"
  echo "  - zip/unzip:   $(command -v zip), $(command -v unzip)"
fi

echo "=== [3/4] Installing xtool Prebuilt AppImage in User Space (~/.local/bin/xtool) ==="
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ]; then
  XTOOL_ASSET="xtool-x86_64.AppImage"
elif [ "$ARCH" = "aarch64" ]; then
  XTOOL_ASSET="xtool-aarch64.AppImage"
else
  echo "Unsupported architecture: $ARCH" >&2
  exit 1
fi

XTOOL_VERSION="${XTOOL_VERSION:-1.21.0}"
XTOOL_URL="https://github.com/xtool-org/xtool/releases/download/${XTOOL_VERSION}/${XTOOL_ASSET}"
XTOOL_DIR="${HOME}/.local/share/xtool"
BIN_DIR="${HOME}/.local/bin"

mkdir -p "$XTOOL_DIR" "$BIN_DIR"

if [ -x "${BIN_DIR}/xtool" ] && "${BIN_DIR}/xtool" --version 2>/dev/null | grep -q "${XTOOL_VERSION}"; then
  echo "xtool ${XTOOL_VERSION} is already installed at ${BIN_DIR}/xtool"
else
  echo "Downloading ${XTOOL_URL} ..."
  curl -fL --retry 3 -o "${XTOOL_DIR}/${XTOOL_ASSET}" "$XTOOL_URL"
  chmod +x "${XTOOL_DIR}/${XTOOL_ASSET}"

  echo "Extracting AppImage (--appimage-extract) so FUSE is not required at runtime..."
  (
    cd "$XTOOL_DIR"
    rm -rf squashfs-root
    "./${XTOOL_ASSET}" --appimage-extract >/dev/null
  )
  ln -sf "${XTOOL_DIR}/squashfs-root/AppRun" "${BIN_DIR}/xtool"
fi

if ! grep -q '.local/bin' "${HOME}/.bashrc" 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "${HOME}/.bashrc"
fi
export PATH="${BIN_DIR}:${PATH}"

echo "Verified xtool binary: $(command -v xtool)"
echo "Verified xtool version: $(xtool --version)"

if [ "$WITH_SWIFT" = true ]; then
  echo "=== [4/4] Installing Swift Toolchain via swiftly (--with-swift) ==="
  if command -v swift >/dev/null 2>&1; then
    echo "Swift already installed: $(swift --version | head -n 1)"
  else
    TMP_SWIFTLY="$(mktemp -d)"
    (
      cd "$TMP_SWIFTLY"
      curl -fsSLO "https://download.swift.org/swiftly/linux/swiftly-${ARCH}.tar.gz"
      tar zxf "swiftly-${ARCH}.tar.gz"
      ./swiftly init --quiet-shell-followup -y
    )
    rm -rf "$TMP_SWIFTLY"
    # shellcheck disable=SC1090
    [ -f "${HOME}/.local/share/swiftly/env.sh" ] && . "${HOME}/.local/share/swiftly/env.sh"
    swiftly install 6.4-snapshot || swiftly install latest
    swift --version
  fi
else
  echo "=== [4/4] Skipping Swift compiler install (not required for xtool auth/devices/install; pass --with-swift to install) ==="
fi

echo "=== WSL2 xtool Setup Complete! ==="
