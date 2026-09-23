const ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive";

export async function getHistoricalDaily(
    latitude,
    longitude,
    startDate,
    endDate
) {
    const url =
        `${ARCHIVE_API_URL}` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&start_date=${startDate}` +
        `&end_date=${endDate}` +
        `&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_mean` +
        `&wind_speed_unit=ms` +
        `&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Open-Meteo historical request failed: ${response.status}`);
    }

    return response.json();
}
