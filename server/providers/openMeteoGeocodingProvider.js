import { fetchJsonWithRetry } from "../utils/fetchJson.js";

export async function searchLocations(query) {
    const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(query)}` +
        `&count=5` +
        `&language=en` +
        `&format=json`;

    const data = await fetchJsonWithRetry(url, {
        label: "Open-Meteo geocoding request failed",
        retries: 0,
        timeoutMs: 4500
    });

    return data.results ?? [];
}