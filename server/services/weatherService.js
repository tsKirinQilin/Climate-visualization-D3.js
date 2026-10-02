import { getCurrentWeather } from "../providers/openWeatherProvider.js";
import {
    getWithPersistentFallback,
    quantizedCoordinateKey
} from "../utils/persistentCache.js";
import { getRealtimeMapSnapshot } from "./temperatureMapService.js";

const CURRENT_WEATHER_TTL = 10 * 60 * 1000;
const INTERACTIVE_WAIT_MS = 5000;

function normalizeWeather(weatherData) {
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

export async function getWeatherForLocation(latitude, longitude) {
    const key = quantizedCoordinateKey(latitude, longitude, 2);

    try {
        const result = await getWithPersistentFallback({
            namespace: "current-weather",
            key,
            ttlMs: CURRENT_WEATHER_TTL,
            maxWaitMs: INTERACTIVE_WAIT_MS,
            loadFresh: async () => normalizeWeather(
                await getCurrentWeather(latitude, longitude)
            )
        });

        return {
            ...result.data,
            cache: {
                status: result.status,
                savedAt: result.savedAt,
                ageMs: result.ageMs
            }
        };
    } catch (error) {
        // Emergency presentation fallback: derive the fields available on the
        // global cached Open-Meteo grid. Humidity/pressure are intentionally
        // left unavailable rather than invented.
        const mapSnapshot = await getRealtimeMapSnapshot();
        const nearest = mapSnapshot.points.reduce((best, point) => {
            const dLat = point.latitude - latitude;
            let dLon = point.longitude - longitude;
            if (dLon > 180) dLon -= 360;
            if (dLon < -180) dLon += 360;
            const distance = dLat * dLat + dLon * dLon;
            return !best || distance < best.distance
                ? { point, distance }
                : best;
        }, null)?.point;

        if (!nearest) throw error;

        return {
            location: {
                name: "",
                country: "",
                latitude,
                longitude,
                timezoneOffset: 0
            },
            weather: {
                temperature: nearest.temperature,
                feelsLike: nearest.temperature,
                humidity: null,
                pressure: null,
                windSpeed: nearest.windSpeed,
                cloudiness: nearest.cloudCover,
                precipitation: nearest.precipitation ?? 0,
                condition: "Cached map data",
                description: "cached map fallback"
            },
            observedAt: mapSnapshot.cache?.savedAt ?? new Date().toISOString(),
            cache: {
                status: "cache-map-fallback",
                savedAt: mapSnapshot.cache?.savedAt ?? null,
                ageMs: mapSnapshot.cache?.ageMs ?? null
            }
        };
    }
}
