import {
    getCurrentMapConditions,
    getCurrentPrecipitationConditions,
    getSeasonalMapConditions
} from "../providers/openMeteoTemperatureProvider.js";
import {
    getWithPersistentFallback,
    quantizedCoordinateKey
} from "../utils/persistentCache.js";

const GRID_STEP = 15;
const PRECIPITATION_DETAIL_CACHE_TTL = 10 * 60 * 1000;
const REALTIME_MAP_CACHE_TTL = 10 * 60 * 1000;
const FORECAST_CACHE_TTL = 6 * 60 * 60 * 1000;
const INTERACTIVE_WAIT_MS = 5000;

function createGlobalGrid(step = GRID_STEP) {
    const points = [];
    const latitudes = [];

    for (let latitude = -85; latitude <= 85; latitude += step) {
        latitudes.push(latitude);
    }

    if (latitudes.at(-1) !== 85) {
        latitudes.push(85);
    }

    for (const latitude of latitudes) {
        for (let longitude = -180; longitude < 180; longitude += step) {
            points.push({ latitude, longitude });
        }
    }

    return points;
}

function monthDistanceFromCurrent(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const now = new Date();

    return (
        (year - now.getUTCFullYear()) * 12 +
        (monthNumber - 1 - now.getUTCMonth())
    );
}

export function isForecastMonthSupported(month) {
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
        return false;
    }

    const [year, monthNumber] = month.split("-").map(Number);

    if (monthNumber < 1 || monthNumber > 12 || year < 2000) {
        return false;
    }

    const distance = monthDistanceFromCurrent(month);
    return distance >= 0 && distance <= 6;
}

function cacheMeta(result) {
    return {
        status: result.status,
        savedAt: result.savedAt,
        ageMs: result.ageMs
    };
}

export async function getRealtimeMapSnapshot() {
    const grid = createGlobalGrid();

    const result = await getWithPersistentFallback({
        namespace: "realtime-map",
        key: "global-15deg",
        ttlMs: REALTIME_MAP_CACHE_TTL,
        maxWaitMs: INTERACTIVE_WAIT_MS,
        loadFresh: async () => {
            const data = await getCurrentMapConditions(grid);

            return data
                .map((item, index) => ({
                    latitude: grid[index]?.latitude ?? item.latitude,
                    longitude: grid[index]?.longitude ?? item.longitude,
                    temperature: item.current?.temperature_2m,
                    precipitation: item.current?.precipitation,
                    cloudCover: item.current?.cloud_cover,
                    windSpeed: item.current?.wind_speed_10m,
                    windDirection: item.current?.wind_direction_10m
                }))
                .filter((point) => Number.isFinite(point.temperature));
        }
    });

    return {
        points: result.data,
        cache: cacheMeta(result)
    };
}

export async function getRealtimeMapPoints() {
    return (await getRealtimeMapSnapshot()).points;
}

function wrapLongitude(longitude) {
    let value = longitude;
    while (value < -180) value += 360;
    while (value >= 180) value -= 360;
    return value;
}

export function createPrecipitationDetailGrid(
    centerLatitude,
    centerLongitude,
    zoom
) {
    const zoomBand = zoom >= 4 ? 4 : zoom >= 2 ? 2 : 1;

    const settings =
        zoomBand === 4
            ? { step: 2.5, latitudeRadius: 10, longitudeRadius: 15 }
            : zoomBand === 2
                ? { step: 3.5, latitudeRadius: 14, longitudeRadius: 22 }
                : { step: 5, latitudeRadius: 20, longitudeRadius: 30 };

    const minLatitude = Math.max(
        -75,
        centerLatitude - settings.latitudeRadius
    );
    const maxLatitude = Math.min(
        75,
        centerLatitude + settings.latitudeRadius
    );
    const points = [];

    for (
        let latitude = minLatitude;
        latitude <= maxLatitude + 0.0001;
        latitude += settings.step
    ) {
        for (
            let longitudeOffset = -settings.longitudeRadius;
            longitudeOffset <= settings.longitudeRadius + 0.0001;
            longitudeOffset += settings.step
        ) {
            points.push({
                latitude: Number(latitude.toFixed(4)),
                longitude: Number(
                    wrapLongitude(centerLongitude + longitudeOffset).toFixed(4)
                )
            });
        }
    }

    return { points, step: settings.step, zoomBand };
}

export async function getRealtimePrecipitationPoints(
    centerLatitude,
    centerLongitude,
    zoom = 1
) {
    const normalizedZoom = Number.isFinite(zoom)
        ? Math.max(1, Math.min(8, zoom))
        : 1;
    const roundedLatitude = Math.round(centerLatitude / 5) * 5;
    const roundedLongitude = Math.round(centerLongitude / 5) * 5;
    const { points: grid, step, zoomBand } = createPrecipitationDetailGrid(
        roundedLatitude,
        roundedLongitude,
        normalizedZoom
    );

    const key = `${quantizedCoordinateKey(roundedLatitude, roundedLongitude, 0)}_z${zoomBand}`;

    const result = await getWithPersistentFallback({
        namespace: "precipitation-detail",
        key,
        ttlMs: PRECIPITATION_DETAIL_CACHE_TTL,
        maxWaitMs: INTERACTIVE_WAIT_MS,
        loadFresh: async () => {
            const data = await getCurrentPrecipitationConditions(grid);

            return data
                .map((item, index) => ({
                    latitude: grid[index]?.latitude ?? item.latitude,
                    longitude: grid[index]?.longitude ?? item.longitude,
                    precipitation: item.current?.precipitation
                }))
                .filter((point) => Number.isFinite(point.precipitation));
        }
    });

    return {
        points: result.data,
        step,
        cache: cacheMeta(result)
    };
}

export async function getForecastMapSnapshot(month) {
    const grid = createGlobalGrid();

    const result = await getWithPersistentFallback({
        namespace: "forecast-map",
        key: month,
        ttlMs: FORECAST_CACHE_TTL,
        maxWaitMs: INTERACTIVE_WAIT_MS,
        loadFresh: async () => {
            const data = await getSeasonalMapConditions(grid, month);

            return data
                .map((item, index) => {
                    const times = item.monthly?.time ?? [];
                    const monthIndex = times.findIndex((time) =>
                        String(time).startsWith(month)
                    );

                    if (monthIndex < 0) return null;

                    return {
                        latitude: grid[index]?.latitude ?? item.latitude,
                        longitude: grid[index]?.longitude ?? item.longitude,
                        temperature: item.monthly?.temperature_2m_mean?.[monthIndex],
                        anomaly: item.monthly?.temperature_2m_anomaly?.[monthIndex],
                        precipitation: item.monthly?.precipitation_mean?.[monthIndex],
                        precipitationAnomaly: item.monthly?.precipitation_anomaly?.[monthIndex],
                        windSpeed: item.monthly?.wind_speed_10m_mean?.[monthIndex],
                        windSpeedAnomaly: item.monthly?.wind_speed_10m_anomaly?.[monthIndex]
                    };
                })
                .filter((point) => point && Number.isFinite(point.temperature));
        }
    });

    return {
        points: result.data,
        cache: cacheMeta(result)
    };
}

export async function getForecastMapPoints(month) {
    return (await getForecastMapSnapshot(month)).points;
}
