import Foundation

/// The deep links the Live Activity and the widget open Flow with. The page
/// reads them (src/native.js parseDeepLink):
///
/// - `flow://done?task=<id>&minutes=<n>` — Log done for that task, minutes
///   filled in. Without `minutes` the page takes the running timer's.
/// - `flow://start?task=<id>` — start the timer on it.
enum FlowLink {
    static let scheme = "flow"

    static func done(task: String, minutes: Int? = nil) -> URL {
        var items = [URLQueryItem(name: "task", value: task)]
        if let minutes { items.append(URLQueryItem(name: "minutes", value: String(max(1, minutes)))) }
        return make("done", items)
    }

    static func start(task: String) -> URL {
        make("start", [URLQueryItem(name: "task", value: task)])
    }

    /// Opens Flow and nothing else (the page ignores it).
    static let app = URL(string: "flow://now")!

    /// Whole minutes a timer ran, never less than one: the page's elapsedMinutes.
    static func minutes(from start: Date, to end: Date) -> Int {
        max(1, Int((end.timeIntervalSince(start) / 60).rounded()))
    }

    private static func make(_ action: String, _ items: [URLQueryItem]) -> URL {
        var c = URLComponents()
        c.scheme = scheme
        c.host = action
        // URLComponents leaves "+" (and more) inside values as they are;
        // ids are plain, but escape everything outside the unreserved set anyway.
        c.percentEncodedQueryItems = items.map {
            URLQueryItem(name: $0.name, value: $0.value?.addingPercentEncoding(withAllowedCharacters: .flowQueryValue))
        }
        return c.url ?? app
    }
}

extension CharacterSet {
    /// Unreserved characters (RFC 3986): everything else in a query value is escaped.
    static let flowQueryValue = CharacterSet(charactersIn:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
}
