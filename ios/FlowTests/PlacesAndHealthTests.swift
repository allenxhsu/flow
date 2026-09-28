import XCTest

/// The pure parts of arrive / leave and Apple Health.
final class PlacesAndHealthTests: XCTestCase {
    func testRegionIdsNameTheirPlace() {
        XCTAssertEqual(GeofenceBook.regionId("place_gym"), "flow.place.place_gym")
        XCTAssertEqual(GeofenceBook.place(fromRegion: "flow.place.place_gym"), "place_gym")
        XCTAssertNil(GeofenceBook.place(fromRegion: "someone.else"))
    }

    func testThePageSeesPlaceIdsOnly() throws {
        let suite = "flow.tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let book = GeofenceBook(defaults: defaults, key: "fences")
        book.set("place_gym", .init(name: "Gym", latitude: 12.5, longitude: 45.25, radius: 30))
        XCTAssertEqual(book.fences["place_gym"]?.radius, GeofenceBook.minimumRadius, "never below the minimum")
        let status = book.status(authorized: true)
        XCTAssertEqual(status["type"] as? String, "flow.geofence.status")
        XCTAssertEqual(status["authorized"] as? Bool, true)
        let places = try XCTUnwrap(status["places"] as? [[String: Any]])
        XCTAssertEqual(places.count, 1)
        XCTAssertEqual(places[0]["id"] as? String, "place_gym")
        XCTAssertEqual(places[0]["set"] as? Bool, true)
        let json = String(data: try JSONSerialization.data(withJSONObject: status), encoding: .utf8) ?? ""
        XCTAssertFalse(json.contains("12.5") || json.contains("45.25") || json.contains("latitude"), json)

        XCTAssertNotNil(GeofenceBook(defaults: defaults, key: "fences").fences["place_gym"], "kept on this device")
        book.clear("place_gym")
        XCTAssertTrue(GeofenceBook(defaults: defaults, key: "fences").fences.isEmpty)
    }

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return c
    }

    private func at(_ s: String) -> Date {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }

    func testTheDayIsTheLocalDay() {
        XCTAssertEqual(HealthMath.day(at("2026-09-28 00:30"), calendar: calendar), "2026-09-28")
        XCTAssertEqual(HealthMath.day(at("2026-09-27 23:59"), calendar: calendar), "2026-09-27")
    }

    func testLastNightAndYesterday() {
        let now = at("2026-09-28 07:00")
        let night = HealthMath.lastNight(before: now, calendar: calendar)
        XCTAssertEqual(night.start, at("2026-09-27 18:00"))
        XCTAssertEqual(night.end, now, "up to now, early in the morning")
        XCTAssertEqual(HealthMath.lastNight(before: at("2026-09-28 20:00"), calendar: calendar).end, at("2026-09-28 14:00"))
        let y = HealthMath.yesterday(before: now, calendar: calendar)
        XCTAssertEqual(y.start, at("2026-09-27 00:00"))
        XCTAssertEqual(y.end, at("2026-09-28 00:00"))
    }

    func testSleepCountsOverlapsOnceAndOnlyInsideTheNight() throws {
        let window = DateInterval(start: at("2026-09-27 18:00"), end: at("2026-09-28 14:00"))
        let watch = [DateInterval(start: at("2026-09-27 23:00"), end: at("2026-09-28 03:00")),
                     DateInterval(start: at("2026-09-28 03:30"), end: at("2026-09-28 06:30"))]
        let phone = [DateInterval(start: at("2026-09-27 23:30"), end: at("2026-09-28 06:00"))]
        let nap = [DateInterval(start: at("2026-09-27 15:00"), end: at("2026-09-27 16:00"))]
        XCTAssertEqual(try XCTUnwrap(HealthMath.sleepHours(watch + phone + nap, within: window)), 7.5, accuracy: 0.001)
        XCTAssertNil(HealthMath.sleepHours([], within: window), "no data, no number")
        XCTAssertNil(HealthMath.sleepHours(nap, within: window))
    }
}
