import {
    getCurrentMapConditions,
    getCurrentPrecipitationConditions,
    getSeasonalMapConditions
} from "../providers/openMeteoTemperatureProvider.js";

const GRID_STEP = 15;
const PRECIPITATION_DETAIL_CACHE_TTL =
    10 * 60 * 1000;

const realtimePrecipitationDetailCache = new Map();

const forecastMapCache = new Map();

const FORECAST_CACHE_TTL =
    6 * 60 * 60 * 1000;

function createGlobalGrid(step = GRID_STEP) {
    const points = [];

    for (let latitude = -75; latitude <= 75; latitude += step) {
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

export async function getRealtimeMapPoints() {
    const grid = createGlobalGrid();
    const data = await getCurrentMapConditions(grid);

    return data
        .map((result) => ({
            latitude: result.latitude,
            longitude: result.longitude,
            temperature: result.current?.temperature_2m,
            precipitation: result.current?.precipitation,
            cloudCover: result.current?.cloud_cover,
            windSpeed: result.current?.wind_speed_10m,
            windDirection: result.current?.wind_direction_10m
        }))
        .filter((point) => Number.isFinite(point.temperature));
}


function wrapLongitude(longitude) {
    let value = longitude;

    while (value < -180) value += 360;
    while (value >= 180) value -= 360;

    return value;
}

function createPrecipitationDetailGrid(
    centerLatitude,
    centerLongitude,
    zoom
) {
    const zoomBand =
        zoom >= 4
            ? 4
            : zoom >= 2
                ? 2
                : 1;

    const settings =
        zoomBand === 4
            ? {
                step: 2.5,
                latitudeRadius: 10,
                longitudeRadius: 15
            }
            : zoomBand === 2
                ? {
                    step: 3.5,
                    latitudeRadius: 14,
                    longitudeRadius: 22
                }
                : {
                    step: 5,
                    latitudeRadius: 20,
                    longitudeRadius: 30
                };

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
                    wrapLongitude(
                        centerLongitude + longitudeOffset
                    ).toFixed(4)
                )
            });
        }
    }

    return {
        points,
        step: settings.step,
        zoomBand
    };
}

export async function getRealtimePrecipitationPoints(
    centerLatitude,
    centerLongitude,
    zoom = 1
) {
    const normalizedZoom =
        Number.isFinite(zoom)
            ? Math.max(1, Math.min(8, zoom))
            : 1;

    const roundedLatitude =
        Math.round(centerLatitude / 5) * 5;

    const roundedLongitude =
        Math.round(centerLongitude / 5) * 5;

    const { points: grid, step, zoomBand } =
        createPrecipitationDetailGrid(
            roundedLatitude,
            roundedLongitude,
            normalizedZoom
        );

    const cacheKey =
        `${roundedLatitude}:${roundedLongitude}:${zoomBand}`;

    const cached =
        realtimePrecipitationDetailCache.get(cacheKey);

    if (
        cached?.points &&
        Date.now() - cached.createdAt <
            PRECIPITATION_DETAIL_CACHE_TTL
    ) {
        return {
            points: cached.points,
            step
        };
    }

    if (cached?.promise) {
        return {
            points: await cached.promise,
            step
        };
    }

    const promise = (async () => {
        const data =
            await getCurrentPrecipitationConditions(grid);

        return data
            .map((result) => ({
                latitude: result.latitude,
                longitude: result.longitude,
                precipitation:
                    result.current?.precipitation
            }))
            .filter((point) =>
                Number.isFinite(point.precipitation)
            );
    })();

    realtimePrecipitationDetailCache.set(
        cacheKey,
        {
            createdAt: 0,
            points: null,
            promise
        }
    );

    try {
        const points = await promise;

        realtimePrecipitationDetailCache.set(
            cacheKey,
            {
                createdAt: Date.now(),
                points,
                promise: null
            }
        );

        return {
            points,
            step
        };
    } catch (error) {
        realtimePrecipitationDetailCache.delete(
            cacheKey
        );

        throw error;
    }
}

export async function getForecastMapPoints(month) {
    const cached = forecastMapCache.get(month);

    if (
        cached &&
        Date.now() - cached.createdAt <
            FORECAST_CACHE_TTL
    ) {
        return cached.points;
    }

    const grid = createGlobalGrid();

    const data =
        await getSeasonalMapConditions(
            grid,
            month
        );

    const points = data
        .map((result) => {
            const times =
                result.monthly?.time ?? [];

            const monthIndex =
                times.findIndex((time) =>
                    String(time).startsWith(month)
                );

            if (monthIndex < 0) {
                return null;
            }

            return {
                latitude: result.latitude,
                longitude: result.longitude,

                temperature:
                    result.monthly
                        ?.temperature_2m_mean
                        ?.[monthIndex],

                anomaly:
                    result.monthly
                        ?.temperature_2m_anomaly
                        ?.[monthIndex],

                precipitation:
                    result.monthly
                        ?.precipitation_mean
                        ?.[monthIndex],

                precipitationAnomaly:
                    result.monthly
                        ?.precipitation_anomaly
                        ?.[monthIndex],

                windSpeed:
                    result.monthly
                        ?.wind_speed_10m_mean
                        ?.[monthIndex],

                windSpeedAnomaly:
                    result.monthly
                        ?.wind_speed_10m_anomaly
                        ?.[monthIndex]
            };
        })
        .filter(
            (point) =>
                point &&
                Number.isFinite(
                    point.temperature
                )
        );

    forecastMapCache.set(month, {
        createdAt: Date.now(),
        points
    });

    return points;
}
