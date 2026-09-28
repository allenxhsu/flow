#!/usr/bin/env bash
# Build Flow's iPhone app (the Terminal) on this Mac and install it on the
# connected iPhone, then open it.
#
# Needs, once:
#   - Xcode, signed in with your Apple ID (Xcode › Settings › Accounts), so
#     Xcode can make the development certificate and profiles itself;
#   - XcodeGen (brew install xcodegen);
#   - shell-kit and sync-kit beside this repository (see ios/README.md);
#   - the iPhone connected by cable (or paired over Wi-Fi), unlocked, "Trust
#     This Computer" tapped, and Developer Mode on (Settings › Privacy &
#     Security › Developer Mode).
#
# Usage: npm run ios:install              # the one connected iPhone
#        npm run ios:install -- <udid>    # or name one
#
# The team comes from DEVELOPMENT_TEAM, else ios/Local.xcconfig, else your
# Apple Development certificate. The bundle id prefix from BUNDLE_PREFIX,
# else ios/Local.xcconfig, else local.<team>.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo="$(pwd)"
ios="$repo/ios"
derived="${TMPDIR:-/tmp}/flow-ios-derived"
log="$derived/xcodebuild.log"

fail() { for line in "$@"; do echo "$line" >&2; done; exit 1; }

# --- tools and neighbours ----------------------------------------------------
command -v xcodebuild >/dev/null 2>&1 && xcodebuild -version >/dev/null 2>&1 \
  || fail "Xcode is not ready. Install Xcode from the App Store, open it once, then run:" \
          "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
command -v xcodegen >/dev/null 2>&1 || fail "XcodeGen is missing: brew install xcodegen"
xcrun devicectl --version >/dev/null 2>&1 || fail "xcrun devicectl is missing: it comes with Xcode 15 or later."
[[ -d "$repo/../shell-kit" ]] || fail "shell-kit is not beside this repository ($(cd "$repo/.." && pwd)/shell-kit)." \
  "  git clone https://github.com/allenxhsu/shell-kit \"$(cd "$repo/.." && pwd)/shell-kit\""
[[ -f "$repo/../sync-kit/swift/Package.swift" ]] || fail "sync-kit (with swift/) is not beside this repository." \
  "  cd \"$(cd "$repo/.." && pwd)\" && ln -s \"$(basename "$repo")/sync-kit\" sync-kit"

# --- the phone ---------------------------------------------------------------
device="${1:-${DEVICE:-}}"
if [[ -z "$device" ]]; then
  json="$(mktemp -t flow-devices).json"
  xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1 || true
  # One line per iPhone this Mac is paired with and can reach: udid, name, developer mode.
  phones="$(node -e '
    const fs = require("fs");
    let r = {};
    try { r = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch {}
    for (const d of r.result?.devices || []) {
      const hw = d.hardwareProperties || {}, cp = d.connectionProperties || {}, dp = d.deviceProperties || {};
      if (hw.platform !== "iOS" || !/iphone/i.test(hw.deviceType || hw.productType || "")) continue;
      if (cp.pairingState !== "paired" || cp.tunnelState === "unavailable") continue;
      console.log([hw.udid || d.identifier, dp.developerModeStatus || "unknown", dp.name || "iPhone"].join("\t"));
    }' "$json")"
  rm -f "$json"
  count=$(printf '%s' "$phones" | grep -c . || true)
  if [[ "$count" -eq 0 ]]; then
    fail "No iPhone is reachable. Connect it with a cable, unlock it, tap Trust, and try again." \
         "(xcrun devicectl list devices shows what this Mac can see.)"
  fi
  if [[ "$count" -gt 1 ]]; then
    echo "More than one iPhone is connected:" >&2
    printf '%s\n' "$phones" | awk -F'\t' '{print "  " $1 "  " $3}' >&2
    fail "Name one: npm run ios:install -- <udid>"
  fi
  device="$(printf '%s' "$phones" | cut -f1)"
  devmode="$(printf '%s' "$phones" | cut -f2)"
  name="$(printf '%s' "$phones" | cut -f3)"
  if [[ "$devmode" == "disabled" ]]; then
    fail "Developer Mode is off on $name. On the iPhone: Settings › Privacy & Security › Developer Mode," \
         "turn it on, restart when asked, confirm, then run this again."
  fi
  echo "iPhone: $name ($device)"
else
  echo "iPhone: $device"
fi

# --- the signing team and the bundle id prefix ------------------------------
setting() { # setting <NAME>: its value in ios/Local.xcconfig, or nothing
  [[ -f "$ios/Local.xcconfig" ]] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\\([^[:space:]]*\\).*/\\1/p" "$ios/Local.xcconfig" | tail -1
}
team="${DEVELOPMENT_TEAM:-}"
[[ -n "$team" ]] || team="$(setting DEVELOPMENT_TEAM)"
[[ "$team" == "ABCDE12345" ]] && team=""   # the example's placeholder
if [[ -z "$team" ]]; then
  # A development certificate carries the team id in its OU field.
  team=$(security find-certificate -c "Apple Development:" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null \
    | grep -o 'OU *= *[A-Z0-9]\{10\}' | head -1 | awk -F'= *' '{print $2}' || true)
fi
if [[ -z "$team" ]]; then
  fail "No signing team found. Sign in to Xcode › Settings › Accounts with your Apple ID and let it" \
       "create an Apple Development certificate (Manage Certificates › +), or put your team id in" \
       "ios/Local.xcconfig (copy Local.xcconfig.example), or pass it:" \
       "  DEVELOPMENT_TEAM=XXXXXXXXXX npm run ios:install"
fi
prefix="${BUNDLE_PREFIX:-}"
[[ -n "$prefix" ]] || prefix="$(setting BUNDLE_PREFIX)"
[[ "$prefix" == "com.example.you" || "$prefix" == "org.example" ]] && prefix=""
[[ -n "$prefix" ]] || prefix="local.$(printf '%s' "$team" | tr '[:upper:]' '[:lower:]')"
echo "Team: $team   Bundle id: $prefix.flow"

# --- generate, build, install, open -----------------------------------------
(cd "$ios" && xcodegen generate --quiet) || fail "xcodegen generate failed in ios/."

app="$derived/Build/Products/Debug-iphoneos/Flow.app"
mkdir -p "$derived"
rm -rf "$app"   # never install what an earlier build left behind
echo "Building (the full log goes to $log)…"
if ! xcodebuild \
  -project "$ios/Flow.xcodeproj" \
  -scheme Flow \
  -configuration Debug \
  -destination "id=$device" \
  -derivedDataPath "$derived" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$team" \
  BUNDLE_PREFIX="$prefix" \
  CODE_SIGN_STYLE=Automatic \
  build > "$log" 2>&1; then
  grep -E "error:|errSec|failed|BUILD FAILED" "$log" | tail -20 >&2 || true
  echo "Build failed; the full log is $log" >&2
  if grep -q errSecInternalComponent "$log"; then
    echo "codesign may not use the signing key yet. Click Always Allow on the keychain prompt, or grant it once with:" >&2
    echo "  security set-key-partition-list -S apple-tool:,apple:,codesign: -s ~/Library/Keychains/login.keychain-db" >&2
  fi
  if grep -qE "No Accounts|No profiles for|requires a provisioning profile" "$log"; then
    echo "Xcode could not make a profile: check Xcode › Settings › Accounts has your Apple ID, and that" >&2
    echo "team $team can use App Groups and HealthKit (ios/README.md › On your Apple Developer account)." >&2
  fi
  if grep -q "is not available\|Unable to find a destination" "$log"; then
    echo "Xcode cannot use the iPhone yet: unlock it, keep it connected, and let Xcode finish preparing it (Window › Devices and Simulators)." >&2
  fi
  exit 1
fi
[[ -d "$app" ]] || fail "The build did not produce $app"
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")

echo "Installing $bundle_id…"
xcrun devicectl device install app --device "$device" "$app" \
  || fail "Install failed. Unlock the iPhone and try again; if it says the developer is not trusted:" \
          "Settings › General › VPN & Device Management › your Apple ID › Trust."
if ! xcrun devicectl device process launch --device "$device" "$bundle_id"; then
  echo "Installed, but it did not open: unlock the iPhone, and if iOS says the developer is untrusted," >&2
  echo "Settings › General › VPN & Device Management › your Apple ID › Trust, then tap Flow." >&2
fi
echo
echo "Installed. In Flow: Settings › Sign in to the Portal to pair it, and your Planner projects appear."
