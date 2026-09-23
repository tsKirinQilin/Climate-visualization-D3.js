export async function searchLocations(query) {
    const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(query)}` +
        `&count=5` +
        `&language=en` +
        `&format=json`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Open-Meteo geocoding request failed: ${response.status}`);
    }

    const data = await response.json();

    return data.results ?? [];
}