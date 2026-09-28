import SwiftUI
import ToolkitShell

/// Flow on the iPhone: shell-kit's web view around the bundled web app
/// (web/, copied in by scripts/copy-web.sh), plus what a page cannot do —
/// the Lock Screen timer, the widget's snapshot, arrive / leave at places
/// and Apple Health. The page's side is src/native.js; the messages are
/// listed in docs/API.md.
@main
struct FlowApp: App {
    private static let config = ShellConfig(
        appName: "Flow",
        handlerName: "flow",
        scheme: "flow-app",
        portalOrigin: FlowInfo.portalOrigin,
        connectScheme: "flow",
        urlScheme: "flow",
        handlers: FlowHandlers.all,
        webRoot: Bundle.main.url(forResource: "web", withExtension: nil)
            ?? Bundle.main.bundleURL.appendingPathComponent("web", isDirectory: true)
    )

    init() {
        // Region monitoring relaunches Flow in the background with no page:
        // the location manager has to exist (and have its delegate) at launch.
        MainActor.assumeIsolated { Places.shared.start() }
    }

    var body: some Scene {
        ShellScene(config: Self.config)
    }
}

/// Values from the build settings, through Info.plist.
enum FlowInfo {
    /// The toolkit Portal to pair with by default (PORTAL_ORIGIN in Local.xcconfig), or nil.
    static var portalOrigin: String? {
        guard let s = Bundle.main.object(forInfoDictionaryKey: "FlowPortalOrigin") as? String else { return nil }
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty || t.contains("$(") ? nil : t
    }
}
