const FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast";

export async function getShortRangeForecast(latitude, longitude) {
    const url =
        `${FORECAST_API_URL}` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&hourly=temperature_2m,precipitation_probability,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max` +
        `&forecast_hours=24` +
        `&forecast_days=7` +
        `&wind_speed_unit=ms` +
        `&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Open-Meteo forecast request failed: ${response.status}`);
    }

    return response.json();
}
