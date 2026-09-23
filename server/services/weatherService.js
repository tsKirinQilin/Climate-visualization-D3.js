import { getCurrentWeather } from "../providers/openWeatherProvider.js";

export async function getWeatherForLocation(latitude, longitude) {
    const weatherData = await getCurrentWeather(latitude, longitude);

    return {
        location: {
            name: weatherData.name,
            country: weatherData.sys.country,
            latitude: weatherData.coord.lat,
            longitude: weatherData.coord.lon,
            timezoneOffset: weatherData.timezone
        },

        weather: {
            temperature: weatherData.main.temp,
            feelsLike: weatherData.main.feels_like,
            humidity: weatherData.main.humidity,
            pressure: weatherData.main.pressure,
            windSpeed: weatherData.wind.speed,
            cloudiness: weatherData.clouds.all,
            precipitation:
                (weatherData.rain?.["1h"] ?? 0) +
                (weatherData.snow?.["1h"] ?? 0),
            condition: weatherData.weather[0].main,
            description: weatherData.weather[0].description
        },

        observedAt: new Date(weatherData.dt * 1000).toISOString()
    };
}