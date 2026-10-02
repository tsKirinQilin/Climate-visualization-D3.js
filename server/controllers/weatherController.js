import { getWeatherForLocation } from "../services/weatherService.js";
import { getWeatherTile } from "../providers/openWeatherTileProvider.js";

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

export async function getMapTile(req, res) {
    const { layer, z, x, y } = req.params;
    const zoom = Number(z);
    const tileX = Number(x);
    const tileY = Number(y);

    try {
        const tile = await getWeatherTile(layer, zoom, tileX, tileY);

        res.setHeader("Content-Type", tile.contentType);
        res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
        res.setHeader("X-Weather-Tile-Cache", tile.cacheStatus);
        res.send(tile.buffer);
    } catch (error) {
        console.error(error);
        res.status(error?.status || 502).json({
            error: error?.message || "Failed to retrieve weather tile"
        });
    }
}
