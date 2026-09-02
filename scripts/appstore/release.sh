#!/usr/bin/env bash
#
# Archive FitTrack.AI for distribution and upload it to App Store Connect.
#
# Unlike scripts/build-device.sh (which makes a Development build for a phone
# you own), this produces an App Store build. That needs an *Apple Distribution*
# certificate and an App Store provisioning profile, neither of which exists on
# this machine yet. Rather than making you create them by hand in the developer
# portal, `-allowProvisioningUpdates` with an App Store Connect API key lets
# Xcode create both automatically on the first run.
#
# Required environment (never printed by this script):
#   ASC_KEY_ID     the key's ID
#   ASC_ISSUER_ID  the issuer UUID
#   ASC_KEY_PATH   path to AuthKey_XXXXXXXX.p8
#
# Usage:  ./scripts/appstore/release.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

: "${ASC_KEY_ID:?Set ASC_KEY_ID}"
: "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID}"
: "${ASC_KEY_PATH:?Set ASC_KEY_PATH}"
[ -f "$ASC_KEY_PATH" ] || { echo "No .p8 at $ASC_KEY_PATH"; exit 1; }

# altool does not take a key path — it only looks in this one directory.
KEYDIR="$HOME/.appstoreconnect/private_keys"
mkdir -p "$KEYDIR"
if [ ! -f "$KEYDIR/AuthKey_$ASC_KEY_ID.p8" ]; then
  cp "$ASC_KEY_PATH" "$KEYDIR/AuthKey_$ASC_KEY_ID.p8"
  chmod 600 "$KEYDIR/AuthKey_$ASC_KEY_ID.p8"
fi

BUILD=".build/appstore"
ARCHIVE="$BUILD/FitTrackAI.xcarchive"
rm -rf "$BUILD"
mkdir -p "$BUILD"

# Every upload needs a build number higher than the last one Apple has seen.
# The marketing version (1.0.0) stays put; only this increments.
BUILD_NUMBER="$(date +%Y%m%d%H%M)"
echo "▸ Build number: $BUILD_NUMBER"

echo "▸ Archiving (10–20 min)…"
xcodebuild archive \
  -workspace ios/FitTrackAI.xcworkspace \
  -scheme FitTrackAI \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  | tail -30

cat > "$BUILD/ExportOptions.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>automatic</string>
  <!-- The ENROLLED team, which is the certificate's OU — not the parenthesised
       value in its Common Name. "Apple Development: … (63CJB3ZZYF)" reads like a
       team id but 63CJB3ZZYF is the personal team; exporting under it is what
       produced 'Team "Ross Toma (Personal Team)" is not enrolled'. -->
  <key>teamID</key><string>FMQ2H9F8WV</string>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

echo "▸ Exporting .ipa…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$BUILD" \
  -exportOptionsPlist "$BUILD/ExportOptions.plist" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  | tail -20

IPA="$(find "$BUILD" -name '*.ipa' | head -1)"
[ -n "$IPA" ] || { echo "No .ipa produced"; exit 1; }
echo "▸ Built: $IPA"

echo "▸ Validating before upload…"
xcrun altool --validate-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "▸ Uploading…"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo
echo "✅ Uploaded. Apple takes 5–30 min to process it."
echo "   Watch with: node scripts/appstore/asc.mjs status <appId>"
