import { fetchJsonWithRetry } from "../utils/fetchJson.js";

export async function getCurrentWeather(latitude, longitude) {
    const url =
        `https://api.openweathermap.org/data/2.5/weather` +
        `?lat=${latitude}` +
        `&lon=${longitude}` +
        `&appid=${process.env.OPENWEATHER_API_KEY}` +
        `&units=metric`;

    return fetchJsonWithRetry(url, {
        label: "OpenWeather request failed",
        retries: 0,
        timeoutMs: 4500
    });
}
