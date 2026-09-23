import {
    getSeasonalForecastForLocation,
    isForecastMonthSupported
} from "../services/seasonalForecastService.js";

export async function getSeasonalForecast(req, res) {
    const { lat, lon, month } = req.query;

    const latitude = Number(lat);
    const longitude = Number(lon);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return res.status(400).json({
            error: "Valid latitude and longitude are required"
        });
    }

    if (!isForecastMonthSupported(month)) {
        return res.status(400).json({
            error: "Forecast month must be between the current month and six months ahead"
        });
    }

    try {
        const forecast = await getSeasonalForecastForLocation(
            latitude,
            longitude,
            month
        );

        res.json(forecast);
    } catch (error) {
        console.error(error);

        res.status(502).json({
            error: "Failed to retrieve seasonal forecast"
        });
    }
}
