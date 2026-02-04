#!/bin/bash
# Load the task_walker module and create a device node accessible from anywhere.
set -euo pipefail

module="${1:-}"
mode="${2:-666}"
shift_count=2

if [[ -z "$module" ]]; then
  echo "Usage: $0 <module_name> [mode] [insmod args...]" >&2
  exit 1
fi

# Collect any extra args for insmod (start from third arg if present)
if [[ $# -lt "${shift_count}" ]]; then
  shift_count=$#
fi
shift "${shift_count}"
extra_args=("$@")

script_dir="$(cd "$(dirname "$0")" && pwd)"
device="/dev/${module}"

run_as_root() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

echo "[+] Loading ${module}.ko"
run_as_root /sbin/insmod "${script_dir}/${module}.ko" "${extra_args[@]}"

major=$(awk "\$2 == \"${module}\" {print \$1}" /proc/devices)
if [[ -z "$major" ]]; then
  echo "[-] Could not find major for ${module} in /proc/devices" >&2
  exit 1
fi

if [[ -e "${device}" ]]; then
  echo "[*] Removing existing ${device} to recreate"
  run_as_root rm -f "${device}"
fi

echo "[+] Creating device node ${device} (mode ${mode}) with major ${major}"
run_as_root mknod -m "${mode}" "${device}" c "${major}" 0

echo "[+] Linking ${script_dir}/${module} -> ${device} for local relative access"
ln -sf "${device}" "${script_dir}/${module}"

echo "[✓] Done. Device node: ${device}"
