# Flow for iPhone

The same web app as the Portal's, bundled and served offline inside
[shell-kit](https://github.com/allenxhsu/shell-kit)'s iOS shell, plus what a
page cannot do (SPEC.md › iOS app):

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

- Settings ▸ Sync ▸ **Sign in to the Portal** pairs the app like the Mac app.
- Settings ▸ **Places on this iPhone**: stand somewhere, **Set to where I am
  now**; allow location **Always** for arrive / leave while Flow is closed.
- The morning rating asks Apple Health once; refuse and it simply shows no
  suggestion.
- Long-press the home screen ▸ **+** ▸ Flow for the widget.
