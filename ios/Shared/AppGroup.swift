import Foundation

/// The container the app and the widget share. Its id comes from the build
/// settings (`APP_GROUP` in Config/Base.xcconfig, from the bundle prefix in
/// the uncommitted Local.xcconfig) through each target's Info.plist.
enum AppGroup {
    static var id: String? {
        guard let id = Bundle.main.object(forInfoDictionaryKey: "FlowAppGroup") as? String,
              !id.isEmpty, !id.contains("$(") else { return nil }
        return id
    }

    /// The shared folder, or, unsigned (the simulator in CI, a first build
    /// with no team), this target's own Application Support: the app still
    /// works, the widget just shows its placeholder.
    static var folder: URL {
        if let id, let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) { return url }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }
}
