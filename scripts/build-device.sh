#!/usr/bin/env bash
#
# Build FitTrack, sign it, and install it on a connected iPhone.
#
# Why this exists rather than just `npx expo run:ios --device`:
#
#   React Native 0.86 ships prebuilt XCFrameworks and does not code-sign
#   several of them. iOS refuses to install an app containing any unsigned
#   framework, so the build succeeds with 0 errors and then the install dies
#   with `ApplicationVerificationFailed` / "No code signature found". Signing
#   each framework and re-sealing the app fixes it.
#
# Also the reason to keep this around: a free Apple ID signature expires after
# 7 days. When the app stops launching, run this again.
#
# Usage:  ./scripts/build-device.sh [device-udid]
set -euo pipefail

cd "$(dirname "$0")/.."

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun devicectl list devices 2>/dev/null \
    | awk '/iPhone/ && /connected/ {print $(NF-2)}' | head -1)
  # devicectl prints its own UUID; the build needs the hardware UDID.
  DEVICE=$(xcrun xctrace list devices 2>/dev/null \
    | grep -i iphone | grep -v Simulator | head -1 \
    | sed -E 's/.*\(([0-9A-Fa-f-]{25,})\).*/\1/')
fi
[ -n "$DEVICE" ] || { echo "No connected iPhone found. Plug it in and unlock it."; exit 1; }
echo "▸ Device: $DEVICE"

IDENTITY=$(security find-identity -v -p codesigning \
  | grep "Apple Development" | head -1 | awk '{print $2}')
[ -n "$IDENTITY" ] || {
  echo "No Apple Development signing identity found."
  echo "Xcode → Settings → Accounts → sign in, then set the team in Signing & Capabilities."
  exit 1
}
echo "▸ Identity: $IDENTITY"

echo "▸ Building (first run takes 10–20 min)…"
npx expo run:ios --device "$DEVICE" --no-install || true

APP=$(find "$HOME/Library/Developer/Xcode/DerivedData" \
  -maxdepth 5 -type d -name "FitTrack.app" -path "*Debug-iphoneos*" \
  -exec ls -dt {} + 2>/dev/null | head -1)
[ -n "$APP" ] || { echo "Could not locate the built .app"; exit 1; }
echo "▸ Built: $APP"

echo "▸ Signing frameworks React Native left unsigned…"
ENT=$(mktemp -t fittrack-ent)
codesign -d --entitlements :- "$APP" > "$ENT" 2>/dev/null || true
signed=0
for f in "$APP"/Frameworks/*.framework; do
  [ -e "$f" ] || continue
  if ! codesign -v "$f" 2>/dev/null; then
    codesign --force --sign "$IDENTITY" --timestamp=none "$f" 2>/dev/null
    echo "    signed $(basename "$f")"
    signed=$((signed+1))
  fi
done
echo "▸ Signed $signed framework(s)"

# The app's own signature seals its frameworks, so it must be re-signed after.
if [ -s "$ENT" ]; then
  codesign --force --sign "$IDENTITY" --entitlements "$ENT" --timestamp=none "$APP" 2>/dev/null
else
  codesign --force --sign "$IDENTITY" --timestamp=none "$APP" 2>/dev/null
fi
rm -f "$ENT"
codesign -v --deep --strict "$APP" && echo "▸ Signature valid"

echo "▸ Installing…"
xcrun devicectl device install app --device "$DEVICE" "$APP"

echo
echo "✅ Installed. Start the dev server with:  npx expo start --dev-client"
