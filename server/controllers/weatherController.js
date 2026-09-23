import { getWeatherForLocation } from "../services/weatherService.js";

export async function getCurrentWeather(req, res) {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({
            error: "Latitude and longitude are required"
        });
    }

    const latitude = Number(lat);
    const longitude = Number(lon);

    if (
        Number.isNaN(latitude) ||
        Number.isNaN(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return res.status(400).json({
            error: "Invalid latitude or longitude"
        });
    }

    try {
        const data = await getWeatherForLocation(latitude, longitude);

        res.json(data);
    } catch (error) {
        console.error(error);

        res.status(502).json({
            error: "Failed to retrieve weather data"
        });
    }
}