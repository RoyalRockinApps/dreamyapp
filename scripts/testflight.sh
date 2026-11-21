#!/usr/bin/env bash
# Build the iPhone app on this Mac and upload it to App Store Connect for TestFlight
# (the same procedure as the KH Royals app).
#
#   APPLE_TEAM_ID=NH4U6X4G8C scripts/testflight.sh ["What to Test in this build"]
#
# Needs Xcode and CocoaPods, and the Supabase settings (SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY,
# from .env.local or the environment); without them the build would be the on-device demo.
#
# With an App Store Connect API key (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH = the .p8 file, kept
# outside the repo), Xcode signs and uploads with the key, then scripts/testflight_distribute.mjs
# waits for Apple to process the build and hands it to the external group "DT External Testing"
# with the "What to Test" note, submitting it for Beta App Review when Apple asks. Without a key,
# Xcode must be signed in (Settings → Accounts) to an account on the team, and you add the build
# to the group in App Store Connect yourself.
#
# Each upload gets a new build number from the date and time (2026.1118.2330) unless
# IOS_BUILD_NUMBER is set. The version stays app.json's, so Apple reviews it once and later builds
# of it pass at once. TESTFLIGHT_UPLOAD_ONLY=1 stops after the upload (hand the build out later
# with scripts/testflight_distribute.mjs). Apple takes 10–30 minutes to process a build.
# The clean prebuild rewrites ios/ (git ignores it).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to the Apple team that owns the app in App Store Connect (NH4U6X4G8C)}"
read -r year monthday time <<<"$(date -u +'%Y %m%d %H%M')"
export IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-$year.$((10#$monthday)).$((10#$time))}"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods fails without a UTF-8 locale

# A TestFlight build must talk to the live backend; refuse to ship the demo by accident.
for v in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY; do
  [ -n "$(node --env-file-if-exists=.env.local -p "process.env.$v || ''")" ] || { echo "Set $v (in .env.local or the environment)." >&2; exit 1; }
done

key=""
[ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] && [ -n "${ASC_KEY_PATH:-}" ] && key=1
auth=()
[ -n "$key" ] && auth=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

echo "Building $(node -p "require('./app.json').expo.name") $(node -p "require('./app.json').expo.version") ($IOS_BUILD_NUMBER) for team $APPLE_TEAM_ID"
pkg=$(mktemp)
cp package.json "$pkg"
CI=1 npx expo prebuild --platform ios --clean
cp "$pkg" package.json   # prebuild rewrites the ios/android npm scripts to expo run:*; keep ours
rm -f "$pkg"
[ -d ios/Pods ] || { echo "pod install failed (prebuild doesn't stop for it); see above" >&2; exit 1; }
workspace=$(ls -d ios/*.xcworkspace | head -1)
scheme=$(basename "$workspace" .xcworkspace)

out=ios/build/testflight
mkdir -p "$out"
xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$out/$scheme.xcarchive" \
  -allowProvisioningUpdates ${auth[@]+"${auth[@]}"} archive

cat > "$out/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
EOF
xcodebuild -exportArchive -archivePath "$out/$scheme.xcarchive" \
  -exportOptionsPlist "$out/ExportOptions.plist" -exportPath "$out/export" -allowProvisioningUpdates ${auth[@]+"${auth[@]}"}

echo "Uploaded build $IOS_BUILD_NUMBER."
if [ -n "${TESTFLIGHT_UPLOAD_ONLY:-}" ]; then
  echo "Hand it to the testers with: node scripts/testflight_distribute.mjs $IOS_BUILD_NUMBER --note \"…\""
elif [ -n "$key" ]; then
  if [ -n "${1:-}" ]; then node scripts/testflight_distribute.mjs "$IOS_BUILD_NUMBER" --note "$1"
  else node scripts/testflight_distribute.mjs "$IOS_BUILD_NUMBER"; fi
else
  echo "It shows up in App Store Connect → TestFlight once Apple has processed it; add it to DT External Testing there"
  echo "(or set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH to have this script do it)."
fi
