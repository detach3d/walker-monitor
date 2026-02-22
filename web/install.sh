#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./web/install.sh [options]

Options:
  --no-system-deps   Skip apt dependency installation
  --no-node-setup    Skip Node.js 20 setup (use existing node/npm)
  --no-server        Skip npm install in server/
  --no-build         Skip npm run build in web/
  --build            Force npm run build in web/ (default)
  --node-major N     Required Node.js major version (default: 20)
  -h, --help         Show this help message
EOF
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SERVER_DIR="${ROOT_DIR}/server"
WEB_DIR="${ROOT_DIR}/web"

INSTALL_SYSTEM_DEPS=true
SETUP_NODE=true
INSTALL_SERVER=true
BUILD_WEB=true
NODE_MAJOR=20

run_as_root() {
  if [ "${EUID}" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_system_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "[web/install] Error: apt-get not found. Install dependencies manually on this distro." >&2
    exit 1
  fi

  echo "[web/install] Installing system dependencies (Ubuntu/Debian)"
  run_as_root apt-get update
  run_as_root apt-get install -y curl ca-certificates gnupg
}

node_major_version() {
  node -v | sed -E 's/^v([0-9]+).*/\1/'
}

setup_nodejs() {
  local current_major=""
  if command -v node >/dev/null 2>&1; then
    current_major="$(node_major_version)"
  fi

  if [ -n "${current_major}" ] && [ "${current_major}" -ge "${NODE_MAJOR}" ]; then
    echo "[web/install] Node.js ${current_major} detected (>= ${NODE_MAJOR}); skipping NodeSource setup"
    return
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    echo "[web/install] Error: apt-get not found. Install Node.js ${NODE_MAJOR}+ manually." >&2
    exit 1
  fi

  echo "[web/install] Installing Node.js ${NODE_MAJOR}.x via NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | run_as_root -E bash -
  run_as_root apt-get install -y nodejs
}

require_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "[web/install] Error: npm is not available in PATH." >&2
    exit 1
  fi
}

install_server_deps() {
  if [ ! -f "${SERVER_DIR}/package.json" ]; then
    echo "[web/install] Error: server/package.json not found at ${SERVER_DIR}/package.json" >&2
    exit 1
  fi

  echo "[web/install] Installing server dependencies"
  (
    cd "${SERVER_DIR}"
    npm install
  )
}

install_web_deps_and_build() {
  if [ ! -f "${WEB_DIR}/package.json" ]; then
    echo "[web/install] Error: web/package.json not found at ${WEB_DIR}/package.json" >&2
    exit 1
  fi

  echo "[web/install] Installing web dependencies"
  (
    cd "${WEB_DIR}"
    npm install
  )

  if [ "${BUILD_WEB}" = true ]; then
    echo "[web/install] Building web app"
    (
      cd "${WEB_DIR}"
      npm run build
    )
  else
    echo "[web/install] Skipping web build (--no-build)"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-system-deps)
      INSTALL_SYSTEM_DEPS=false
      ;;
    --no-node-setup)
      SETUP_NODE=false
      ;;
    --no-server)
      INSTALL_SERVER=false
      ;;
    --no-build)
      BUILD_WEB=false
      ;;
    --build)
      BUILD_WEB=true
      ;;
    --node-major)
      if [ "$#" -lt 2 ]; then
        echo "[web/install] Error: --node-major requires a value" >&2
        exit 1
      fi
      NODE_MAJOR="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[web/install] Error: unknown argument '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "${INSTALL_SYSTEM_DEPS}" = true ]; then
  install_system_deps
else
  echo "[web/install] Skipping system dependency install (--no-system-deps)"
fi

if [ "${SETUP_NODE}" = true ]; then
  setup_nodejs
else
  echo "[web/install] Skipping Node.js setup (--no-node-setup)"
fi

require_npm

if [ "${INSTALL_SERVER}" = true ]; then
  install_server_deps
else
  echo "[web/install] Skipping server npm install (--no-server)"
fi

install_web_deps_and_build

echo "[web/install] Done."
echo "[web/install] Start the server with:"
echo "  cd ${SERVER_DIR} && npm start"
