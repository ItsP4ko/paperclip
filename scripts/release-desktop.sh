#!/bin/bash
# Usage: ./scripts/release-desktop.sh 0.2.0 "Release notes here"
# Requires: TAURI_SIGNING_PRIVATE_KEY_PATH set (or pass as env)
set -e

VERSION="${1:?Usage: $0 <version> [notes]}"
NOTES="${2:-v$VERSION}"
REPO="ItsP4ko/paperclip"
BUNDLE_DIR="src-tauri/target/release/bundle"

# Update version in tauri.conf.json
node -e "
const fs = require('fs');
const path = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(fs.readFileSync(path, 'utf8'));
conf.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
console.log('Updated tauri.conf.json to v$VERSION');
"

# Build with signing key
KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/relay-control.key}"
if [ ! -f "$KEY_PATH" ]; then
  echo "Error: signing key not found at $KEY_PATH"
  exit 1
fi
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
npx pnpm desktop:build

# Locate artifacts (macOS ARM)
DMG=$(find "$BUNDLE_DIR/dmg" -name "*aarch64.dmg" | head -1)
TARGZ=$(find "$BUNDLE_DIR/macos" -name "*.app.tar.gz" | head -1)
SIG=$(find "$BUNDLE_DIR/macos" -name "*.app.tar.gz.sig" | head -1)

if [ -z "$SIG" ]; then
  echo "Error: .sig file not found. Make sure TAURI_SIGNING_PRIVATE_KEY_PATH is set correctly."
  exit 1
fi

SIGNATURE=$(cat "$SIG")
# GitHub replaces spaces with dots in asset names — normalize to match
TARGZ_FILENAME=$(basename "$TARGZ" | tr ' ' '.')
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Create version-less DMG copy so /releases/latest/download/Relay.Control_aarch64.dmg works
DMG_VERSIONLESS="$(dirname "$DMG")/Relay.Control_aarch64.dmg"
cp "$DMG" "$DMG_VERSIONLESS"

# Generate latest.json
cat > /tmp/latest.json <<EOF
{
  "version": "$VERSION",
  "notes": "$NOTES",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$SIGNATURE",
      "url": "https://github.com/$REPO/releases/download/v$VERSION/$TARGZ_FILENAME"
    }
  }
}
EOF

echo "Generated latest.json:"
cat /tmp/latest.json

# Create GitHub release and upload all artifacts
gh release create "v$VERSION" \
  "$DMG" \
  "$DMG_VERSIONLESS" \
  "$TARGZ" \
  "$SIG" \
  "/tmp/latest.json" \
  --title "v$VERSION Desktop" \
  --notes "$NOTES" \
  --repo "$REPO"

echo ""
echo "Release v$VERSION published. Existing users will receive the update automatically."
