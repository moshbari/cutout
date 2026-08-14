#!/bin/bash
# Build CutOut for iOS.
#   ./build.sh            → generate project, archive, export a signed .ipa
#   ./build.sh upload     → the above, then upload the build to App Store Connect
#   ./build.sh sim        → generate project and run in the simulator
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
export DEVELOPER_DIR="/Volumes/Predator SSD GM& 1TB/Xcode.app/Contents/Developer"
PATH="$HOME/.local/bin:$PATH"

BUILD="$ROOT/ios/build"
ARCHIVE="$BUILD/CutOut.xcarchive"
EXPORT="$BUILD/export"
MODE="${1:-export}"

# credentials
eval "$(grep -E '^(APP_STORE_CONNECT_ISSUER_ID|APP_STORE_CONNECT_API_KEY_ID|APP_STORE_CONNECT_KEY_PATH|APPLE_TEAM_ID)=' "$HOME/Documents/claude-server/secrets.txt")"

echo "▸ regenerating icons"
node "$ROOT/tools/make-icons.js" > /dev/null

echo "▸ syncing the web app into the bundle"
rm -rf Web && mkdir -p Web
rsync -a --exclude '.DS_Store' "$ROOT/public/" Web/

echo "▸ generating the Xcode project"
xcodegen generate --quiet

if [ "$MODE" = "sim" ]; then
  DEVICE="${2:-iPhone 17 Pro}"
  echo "▸ building for the simulator ($DEVICE)"
  xcodebuild -project CutOut.xcodeproj -scheme CutOut \
    -destination "platform=iOS Simulator,name=$DEVICE" \
    -derivedDataPath "$BUILD/dd" -quiet build
  APP="$BUILD/dd/Build/Products/Debug-iphonesimulator/CutOut.app"
  xcrun simctl boot "$DEVICE" 2>/dev/null || true
  open -a Simulator
  until xcrun simctl list devices | grep "$DEVICE (" | grep -q Booted; do sleep 1; done
  xcrun simctl install booted "$APP"
  xcrun simctl launch booted com.zpresso.cutout
  echo "✓ running in the simulator"
  exit 0
fi

echo "▸ archiving"
rm -rf "$ARCHIVE" "$EXPORT"
xcodebuild -project CutOut.xcodeproj -scheme CutOut \
  -sdk iphoneos -configuration Release \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_API_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID" \
  -quiet archive

DEST=$([ "$MODE" = "upload" ] && echo upload || echo export)
cat > "$BUILD/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>destination</key><string>$DEST</string>
	<key>teamID</key><string>$APPLE_TEAM_ID</string>
	<key>uploadSymbols</key><true/>
	<key>manageAppVersionAndBuildNumber</key><false/>
	<key>signingStyle</key><string>manual</string>
	<key>signingCertificate</key><string>iPhone Distribution</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>com.zpresso.cutout</key><string>CutOut App Store</string>
	</dict>
</dict>
</plist>
EOF

echo "▸ exporting ($DEST)"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT" \
  -exportOptionsPlist "$BUILD/ExportOptions.plist" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_API_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"

echo "✓ done → $EXPORT"
ls -la "$EXPORT" 2>/dev/null || true
