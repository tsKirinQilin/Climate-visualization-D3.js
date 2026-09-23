import { getSeasonalMapConditions } from "../providers/openMeteoTemperatureProvider.js";
import { isForecastMonthSupported } from "./temperatureMapService.js";

export { isForecastMonthSupported };

export async function getSeasonalForecastForLocation(
    latitude,
    longitude,
    month
) {
    const data = await getSeasonalMapConditions(
        [{ latitude, longitude }],
        month
    );

    const result = data[0];

    if (!result) {
        throw new Error("No seasonal forecast data returned");
    }

    const times = result.monthly?.time ?? [];
    const index = times.findIndex((time) =>
        String(time).startsWith(month)
    );

    if (index < 0) {
        throw new Error(`No seasonal forecast available for ${month}`);
    }

    const temperature = result.monthly?.temperature_2m_mean?.[index];
    const anomaly = result.monthly?.temperature_2m_anomaly?.[index];
    const precipitation = result.monthly?.precipitation_mean?.[index];
    const precipitationAnomaly = result.monthly?.precipitation_anomaly?.[index];
    const windSpeed = result.monthly?.wind_speed_10m_mean?.[index];
    const windSpeedAnomaly = result.monthly?.wind_speed_10m_anomaly?.[index];

    if (!Number.isFinite(temperature)) {
        throw new Error(`No seasonal temperature available for ${month}`);
    }

    return {
        month,
        latitude: result.latitude,
        longitude: result.longitude,
        temperature,
        anomaly: Number.isFinite(anomaly) ? anomaly : null,
        precipitation: Number.isFinite(precipitation) ? precipitation : null,
        precipitationAnomaly: Number.isFinite(precipitationAnomaly) ? precipitationAnomaly : null,
        windSpeed: Number.isFinite(windSpeed) ? windSpeed : null,
        windSpeedAnomaly: Number.isFinite(windSpeedAnomaly) ? windSpeedAnomaly : null,
        model: "ECMWF SEAS5 ensemble mean",
        source: "Open-Meteo / ECMWF",
        note: "Seasonal forecasts describe regional monthly conditions and are not exact local day-by-day predictions."
    };
}
