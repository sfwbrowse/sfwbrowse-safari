#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if command -v xcodegen &> /dev/null; then
  echo "Generating Xcode project with xcodegen..."
  xcodegen generate --spec project.yml
  echo "✓ Sfwbrowse.xcodeproj generated successfully."
else
  echo "Note: xcodegen not found on system. Install via 'brew install xcodegen' on macOS to generate Sfwbrowse.xcodeproj."
fi
