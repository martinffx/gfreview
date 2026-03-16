#!/usr/bin/env bash
#
# gfreview installer
# Usage: curl -fsSL https://raw.githubusercontent.com/martinffx/gfreview/main/install.sh | bash
#
set -euo pipefail

# Configuration
GITHUB_REPO="${GITHUB_REPO:-martinffx/gfreview}"
VERSION="${VERSION:-latest}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
INSTALL_NAME="gfreview"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
	echo -e "${GREEN}[info]${NC} $*"
}

log_warn() {
	echo -e "${YELLOW}[warn]${NC} $*"
}

log_error() {
	echo -e "${RED}[error]${NC} $*"
}

# Detect OS
detect_os() {
	local os
	os="$(uname -s)"

	case "$os" in
	Linux*) echo "linux" ;;
	Darwin*) echo "darwin" ;;
	MINGW* | MSYS* | CYGWIN*) echo "windows" ;;
	*) echo "$os" ;;
	esac
}

# Detect architecture
detect_arch() {
	local arch
	arch="$(uname -m)"

	case "$arch" in
	x86_64 | amd64) echo "x64" ;;
	aarch64 | arm64) echo "arm64" ;;
	*) echo "$arch" ;;
	esac
}

# Map OS and arch to artifact name
get_artifact_name() {
	local os="$1"
	local arch="$2"

	case "$os" in
	darwin)
		case "$arch" in
		arm64) echo "gfreview-macos-arm64" ;;
		x64) echo "gfreview-macos-x64" ;;
		esac
		;;
	linux)
		case "$arch" in
		x64) echo "gfreview-linux-x64" ;;
		*) echo "" ;;
		esac
		;;
	windows)
		case "$arch" in
		x64) echo "gfreview-windows-x64.exe" ;;
		esac
		;;
	esac
}

# Get latest version from GitHub
get_latest_version() {
	local version="$1"

	if [[ "$version" == "latest" ]]; then
		# Use GitHub API to get latest release tag
		local response
		response="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null)" || {
			log_error "Failed to fetch latest release from GitHub"
			exit 1
		}

		local tag_name
		tag_name="$(echo "$response" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[^"]*"([^"]+)".*/\1/')" || {
			log_error "Failed to parse release information"
			exit 1
		}

		echo "$tag_name"
	else
		echo "$version"
	fi
}

# Download and install
install() {
	local os arch artifact version url

	os="$(detect_os)"
	arch="$(detect_arch)"

	log_info "Detected: ${os}-${arch}"

	artifact="$(get_artifact_name "$os" "$arch")"

	if [[ -z "$artifact" ]]; then
		log_error "Unsupported platform: ${os}-${arch}"
		log_error "Supported platforms: darwin-arm64, darwin-x64, linux-x64, windows-x64"
		exit 1
	fi

	log_info "Installing ${artifact}..."

	version="$(get_latest_version "$VERSION")"
	log_info "Version: ${version}"

	# Check if we need sudo for installation
	local install_path="${BIN_DIR}/${INSTALL_NAME}"
	local need_sudo=false

	if [[ ! -w "$BIN_DIR" ]]; then
		need_sudo=true
		if [[ "$BIN_DIR" == "/usr/local/bin" ]]; then
			log_warn "No write access to ${BIN_DIR}, trying with sudo..."
		fi
	fi

	# Create temp directory
	local tmp_dir
	tmp_dir="$(mktemp -d)"
	local downloaded_path="${tmp_dir}/${artifact}"

	# Download
	url="https://github.com/${GITHUB_REPO}/releases/download/${version}/${artifact}"
	log_info "Downloading from ${url}..."

	if ! curl -fSL "$url" -o "$downloaded_path" 2>/dev/null; then
		log_error "Failed to download ${artifact} for version ${version}"
		log_error "Make sure the release exists at https://github.com/${GITHUB_REPO}/releases"
		rm -rf "$tmp_dir"
		exit 1
	fi

	# Install
	if [[ "$need_sudo" == "true" ]]; then
		log_info "Installing to ${BIN_DIR} (with sudo)..."
		sudo cp "$downloaded_path" "$install_path"
		sudo chmod +x "$install_path"
	else
		log_info "Installing to ${BIN_DIR}..."
		cp "$downloaded_path" "$install_path"
		chmod +x "$install_path"
	fi

	# Cleanup
	rm -rf "$tmp_dir"

	log_info "Installed gfreview to ${BIN_DIR}/gfreview"

	# Verify installation
	if command -v "$INSTALL_NAME" &>/dev/null; then
		log_info "Successfully installed!"
		"$INSTALL_NAME" --version || true
	else
		log_warn "gfreview installed but not in PATH"
		log_warn "Add ${BIN_DIR} to your PATH or restart your shell"
	fi
}

# Main
main() {
	log_info "gfreview installer"

	# Check for curl
	if ! command -v curl &>/dev/null; then
		log_error "curl is required but not installed"
		exit 1
	fi

	# Check for unzip/download tool (curl handles this)

	install
}

main "$@"
