export async function getCurrentWeather(latitude, longitude) {
    const url =
        `https://api.openweathermap.org/data/2.5/weather` +
        `?lat=${latitude}` +
        `&lon=${longitude}` +
        `&appid=${process.env.OPENWEATHER_API_KEY}` +
        `&units=metric`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`OpenWeather request failed: ${response.status}`);
    }

    const data = await response.json();

    return data;
}
