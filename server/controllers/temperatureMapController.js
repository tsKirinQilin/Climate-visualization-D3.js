import {
    getForecastMapPoints,
    getRealtimeMapPoints,
    getRealtimePrecipitationPoints,
    isForecastMonthSupported
} from "../services/temperatureMapService.js";

export async function getTemperatureMap(req, res) {
    const mode = req.query.mode === "forecast"
        ? "forecast"
        : "realtime";

    try {
        if (mode === "forecast") {
            const { month } = req.query;

            if (!isForecastMonthSupported(month)) {
                return res.status(400).json({
                    error: "Forecast month must be between the current month and six months ahead"
                });
            }

            const points = await getForecastMapPoints(month);

            return res.json({
                mode: "forecast",
                month,
                model: "ECMWF SEAS5 ensemble mean",
                source: "Open-Meteo / ECMWF",
                points
            });
        }

        if (req.query.metric === "precipitation") {
            const latitude = Number(req.query.lat);
            const longitude = Number(req.query.lon);
            const zoom = Number(req.query.zoom ?? 1);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude) ||
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {
                return res.status(400).json({
                    error: "Latitude and longitude are required for precipitation detail"
                });
            }

            const detail =
                await getRealtimePrecipitationPoints(
                    latitude,
                    longitude,
                    zoom
                );

            return res.json({
                mode: "realtime",
                metric: "precipitation",
                generatedAt: new Date().toISOString(),
                source: "Open-Meteo",
                gridStep: detail.step,
                points: detail.points
            });
        }

        const points = await getRealtimeMapPoints();

        return res.json({
            mode: "realtime",
            generatedAt: new Date().toISOString(),
            source: "Open-Meteo",
            gridStep: 15,
            points
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            error: "Failed to retrieve global map data"
        });
    }
}
