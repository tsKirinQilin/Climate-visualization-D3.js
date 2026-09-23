import {
    compareLocations,
    getLocationAnalytics,
    getSeasonalProfile
} from "../services/analyticsService.js";

function validCoordinate(latitude, longitude) {
    return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
    );
}

export async function getLocationAnalyticsController(req, res) {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);

    if (!validCoordinate(latitude, longitude)) {
        return res.status(400).json({
            error: "Valid latitude and longitude are required"
        });
    }

    try {
        const analytics = await getLocationAnalytics(latitude, longitude);
        res.json(analytics);
    } catch (error) {
        console.error(error);
        res.status(502).json({
            error: "Failed to retrieve short-range analytics"
        });
    }
}

export async function getSeasonalProfileController(req, res) {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);

    if (!validCoordinate(latitude, longitude)) {
        return res.status(400).json({
            error: "Valid latitude and longitude are required"
        });
    }

    try {
        const profile = await getSeasonalProfile(latitude, longitude);
        res.json(profile);
    } catch (error) {
        console.error(error);
        res.status(502).json({
            error: "Failed to retrieve seasonal analytics"
        });
    }
}

export async function compareLocationsController(req, res) {
    const first = {
        latitude: Number(req.query.lat1),
        longitude: Number(req.query.lon1)
    };
    const second = {
        latitude: Number(req.query.lat2),
        longitude: Number(req.query.lon2)
    };
    const mode = req.query.mode === "forecast" ? "forecast" : "realtime";

    if (
        !validCoordinate(first.latitude, first.longitude) ||
        !validCoordinate(second.latitude, second.longitude)
    ) {
        return res.status(400).json({
            error: "Two valid locations are required"
        });
    }

    try {
        const comparison = await compareLocations(first, second, mode);
        res.json(comparison);
    } catch (error) {
        console.error(error);
        res.status(502).json({
            error: "Failed to compare locations"
        });
    }
}
