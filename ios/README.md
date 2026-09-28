# Flow for iPhone — the Terminal

The iPhone app is Flow's **Terminal** (SPEC.md › Terminal: the iPhone app):
pick a Planner project, add tasks to it, time the work. It is `terminal.html`
(`src/terminal.js`), bundled and served offline inside
[shell-kit](https://github.com/allenxhsu/shell-kit)'s iOS shell — the build
phase copies it in as the bundle's `index.html`, because shell-kit always
opens `index.html`. The game, the replay and the rest of Flow stay on the
desktop and web app (`index.html`). Tasks added and time logged here reach
Planner as operations (`flow.op` records in Planner's `project` workspace)
that Planner applies itself. Plus what a page cannot do (SPEC.md › iOS app):

- **Lock Screen timer** — a Live Activity (Lock Screen and Dynamic Island)
  while the timer runs; **Finish** opens Log done with the timer's minutes.
- **Home-screen widget** (small, medium) — stamina, mana, points, level and
  the next task, from the snapshot the page writes; tap the task to start it.
- **Arrive / leave** — places marked in Settings ▸ Places on this iPhone are
  watched with region monitoring; each stay becomes a `visit` record and a
  drive between two places a Drive moment. Where a place is stays in this
  app's own storage on the phone — never in a record, the sync, a log or git.
- **Apple Health, read-only** — last night's sleep and yesterday's steps
  suggest the morning rating. Nothing is written to Health or kept.

The page's side is `src/native.js`; the messages are in `docs/API.md`.

## Layout

```
ios/
  project.yml              XcodeGen: app Flow, extension FlowWidgets, tests FlowTests
  Config/Base.xcconfig     shared settings; includes ../Local.xcconfig when present
  Local.xcconfig.example   copy to Local.xcconfig (git-ignored): team, bundle prefix
  Flow/                    the app: App.swift (ShellScene + handlers), Bridge, TimerActivity,
                           SnapshotStore, Places, Health; Core/ holds the pure parts
  Shared/                  compiled into the app and the widget: snapshot, deep links,
                           the Live Activity's attributes, the app group
  FlowWidgets/             the widget and the Live Activity views
  FlowTests/               XCTest for the pure Swift parts
  scripts/copy-web.sh      build phase: the web app → Flow.app/web
  scripts/make-icon.py     draws the app icon (Pillow)
```

## Install it on your iPhone (one command)

Like Heptabase's iPhone app: built on the Mac, installed on the connected
iPhone. Once:

1. Install Xcode (App Store), open it once, and sign in with your Apple ID in
   **Xcode › Settings › Accounts**. Xcode makes the development certificate and
   profiles itself from then on. `brew install xcodegen`.
2. Put shell-kit and sync-kit beside this repository (see Building below).
3. Optional: `cp ios/Local.xcconfig.example ios/Local.xcconfig` and fill in
   `DEVELOPMENT_TEAM`, `BUNDLE_PREFIX` and `PORTAL_ORIGIN`. Without it the
   script takes the team from your Apple Development certificate and uses
   `local.<team>` as the bundle id prefix.
4. On the iPhone: **Settings › Privacy & Security › Developer Mode** on
   (it restarts). Connect it with a cable, unlock it, tap **Trust**.

Then, from the repository:

```sh
npm run ios:install              # the one connected iPhone
npm run ios:install -- <udid>    # when more than one is connected
```

It runs `xcodegen generate`, finds the iPhone with `xcrun devicectl list
devices`, builds Debug for it with `-allowProvisioningUpdates`, installs it
with `xcrun devicectl device install app` and opens it. The first launch may
say the developer is not trusted: **Settings › General › VPN & Device
Management ›** your Apple ID **› Trust**. If the build stops at CodeSign with
`errSecInternalComponent`, the terminal is not yet allowed to use the signing
key: click *Always Allow* on the keychain prompt, or once run
`security set-key-partition-list -S apple-tool:,apple:,codesign: -s ~/Library/Keychains/login.keychain-db`.

In the app, **Settings › Sign in to the Portal** pairs it (the same pairing
as the Mac app); your Planner projects then appear. Set **Your name in
Planner** if it differs from your Flow name. Everything works offline: tasks
you add show at once marked "sending to Planner" and go out when you are back
online. The Portal's pairing token must reach Planner's `project` workspace
as well as `flow`.

## Building

You need a Mac with Xcode 16 or later, [XcodeGen](https://github.com/yonaskolb/XcodeGen)
(`brew install xcodegen`), and shell-kit and sync-kit checked out **beside**
this repository — the same layout as every toolkit app:

```
~/src/flow          this repository
~/src/shell-kit     git clone https://github.com/allenxhsu/shell-kit
~/src/sync-kit      sync-kit (or: ln -s flow/sync-kit sync-kit — the vendored copy has swift/)
```

Then:

```sh
cd flow/ios
cp Local.xcconfig.example Local.xcconfig   # fill in DEVELOPMENT_TEAM and BUNDLE_PREFIX
xcodegen generate
open Flow.xcodeproj
```

Run the **Flow** scheme on a Simulator or your iPhone. `xcodegen generate`
again after pulling (the project file is generated, not committed). Without
`Local.xcconfig` the project still builds for the Simulator with signing off:

```sh
xcodebuild -project Flow.xcodeproj -scheme Flow -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project Flow.xcodeproj -scheme Flow -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO test
```

CI does exactly this on every push (`.github/workflows/ios.yml`).

### On your Apple Developer account (once)

Xcode's automatic signing creates the identifiers on first build if your
account is selected in Xcode ▸ Settings ▸ Accounts. Check, at
developer.apple.com ▸ Certificates, Identifiers & Profiles:

1. App ID `$(BUNDLE_PREFIX).flow` with **App Groups** and **HealthKit**.
2. App ID `$(BUNDLE_PREFIX).flow.widgets` with **App Groups**.
3. App Group `group.$(BUNDLE_PREFIX).flow`, enabled on both App IDs.

No push notifications are needed: the Live Activity is updated by the app itself.

## TestFlight

1. In App Store Connect ▸ Apps, **+ New App**: platform iOS, name Flow (or
   any free name), bundle id `$(BUNDLE_PREFIX).flow`, a SKU of your choice.
2. In Xcode choose **Any iOS Device (arm64)**, then **Product ▸ Archive**.
   Bump `CURRENT_PROJECT_VERSION` in `project.yml` (or in Local.xcconfig)
   for every upload.
3. In the Organizer: **Distribute App ▸ TestFlight & App Store ▸ Distribute**.
4. When processing finishes, App Store Connect ▸ TestFlight: answer the
   export-compliance question (the Info.plist already says no non-exempt
   encryption), add yourself under **Internal Testing**, install with the
   TestFlight app.
5. For the App Store later: the privacy nutrition label should say Health
   and location data are **not collected** (they never leave the device);
   the app's records sync only to your own toolkit Portal.

## First run on the phone

- Settings ▸ **Sign in to the Portal** pairs the app like the Mac app.
- The Terminal has no Places screen and no morning rating, so arrive / leave
  and the Health suggestion (below the Terminal, in the native shell) have
  nowhere to be switched on yet; the Lock Screen timer and the widget work.
- Long-press the home screen ▸ **+** ▸ Flow for the widget.
