#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./agent/install.sh [options]

Options:
  --no-system-deps   Skip apt dependency installation
  --no-build-system  Skip building system/walker + module
  --no-load-module   Skip loading kernel module after build
  --python-bin BIN   Python executable to use (default: python3)
  --module NAME      Kernel module name (default: task_walker)
  -h, --help         Show this help message
EOF
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SYSTEM_DIR="${ROOT_DIR}/system"
VENV_DIR="${SCRIPT_DIR}/venv"
REQ_FILE="${SCRIPT_DIR}/requirements.txt"

INSTALL_SYSTEM_DEPS=true
BUILD_SYSTEM=true
LOAD_MODULE=true
PYTHON_BIN="${PYTHON_BIN:-python3}"
MODULE_NAME="task_walker"

run_as_root() {
  if [ "${EUID}" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_system_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "[agent/install] Error: apt-get not found. Install dependencies manually on this distro." >&2
    exit 1
  fi

  echo "[agent/install] Installing system dependencies (Ubuntu/Debian)"
  run_as_root apt-get update
  run_as_root apt-get install -y \
    build-essential gcc make linux-headers-"$(uname -r)" \
    python3 python3-venv python3-pip
}

build_system_components() {
  if [ ! -d "${SYSTEM_DIR}" ]; then
    echo "[agent/install] Error: system directory not found at ${SYSTEM_DIR}" >&2
    exit 1
  fi

  echo "[agent/install] Building kernel module and walker binary"
  (
    cd "${SYSTEM_DIR}"
    make clean
    make
    gcc -Wall walker.c -o walker
  )
}

load_kernel_module() {
  echo "[agent/install] Loading kernel module ${MODULE_NAME}"
  (
    cd "${SYSTEM_DIR}"
    ./load.sh "${MODULE_NAME}"
  )
}

install_agent_python_deps() {
  if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
    echo "[agent/install] Error: ${PYTHON_BIN} is not available in PATH." >&2
    exit 1
  fi

  if [ ! -f "${REQ_FILE}" ]; then
    echo "[agent/install] Error: requirements file not found at ${REQ_FILE}" >&2
    exit 1
  fi

  if [ ! -d "${VENV_DIR}" ]; then
    echo "[agent/install] Creating virtual environment at ${VENV_DIR}"
    "${PYTHON_BIN}" -m venv "${VENV_DIR}"
  else
    echo "[agent/install] Reusing existing virtual environment at ${VENV_DIR}"
  fi

  VENV_PYTHON="${VENV_DIR}/bin/python"
  if [ ! -x "${VENV_PYTHON}" ]; then
    echo "[agent/install] Error: virtual environment python is missing at ${VENV_PYTHON}" >&2
    exit 1
  fi

  echo "[agent/install] Upgrading pip"
  "${VENV_PYTHON}" -m pip install --upgrade pip

  echo "[agent/install] Installing dependencies from ${REQ_FILE}"
  "${VENV_PYTHON}" -m pip install -r "${REQ_FILE}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-system-deps)
      INSTALL_SYSTEM_DEPS=false
      ;;
    --no-build-system)
      BUILD_SYSTEM=false
      LOAD_MODULE=false
      ;;
    --no-load-module)
      LOAD_MODULE=false
      ;;
    --python-bin)
      if [ "$#" -lt 2 ]; then
        echo "[agent/install] Error: --python-bin requires a value" >&2
        exit 1
      fi
      PYTHON_BIN="$2"
      shift
      ;;
    --module)
      if [ "$#" -lt 2 ]; then
        echo "[agent/install] Error: --module requires a value" >&2
        exit 1
      fi
      MODULE_NAME="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[agent/install] Error: unknown argument '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "${INSTALL_SYSTEM_DEPS}" = true ]; then
  install_system_deps
else
  echo "[agent/install] Skipping system dependency install (--no-system-deps)"
fi

if [ "${BUILD_SYSTEM}" = true ]; then
  build_system_components
else
  echo "[agent/install] Skipping system build (--no-build-system)"
fi

if [ "${LOAD_MODULE}" = true ]; then
  load_kernel_module
else
  echo "[agent/install] Skipping module load (--no-load-module or --no-build-system)"
fi

install_agent_python_deps

echo "[agent/install] Done."
echo "[agent/install] Run the agent with:"
echo "  source ${VENV_DIR}/bin/activate && python ${SCRIPT_DIR}/agent.py"
