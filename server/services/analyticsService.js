import { getShortRangeForecast } from "../providers/openMeteoForecastProvider.js";
import { getHistoricalDaily } from "../providers/openMeteoHistoricalProvider.js";
import { getSeasonalProfileConditions } from "../providers/openMeteoTemperatureProvider.js";
import { getSeasonalForecastForLocation } from "./seasonalForecastService.js";

const shortRangeCache = new Map();
const seasonalProfileCache = new Map();
const historicalCache = new Map();

const SHORT_RANGE_TTL = 10 * 60 * 1000;
const SEASONAL_TTL = 6 * 60 * 60 * 1000;
const HISTORICAL_TTL = 24 * 60 * 60 * 1000;

function cacheKey(...parts) {
    return parts
        .map((part) => typeof part === "number" ? part.toFixed(3) : String(part))
        .join(":");
}

function readCache(cache, key, ttl) {
    const cached = cache.get(key);

    if (!cached || Date.now() - cached.createdAt > ttl) {
        return null;
    }

    return cached.value;
}

function writeCache(cache, key, value) {
    cache.set(key, {
        createdAt: Date.now(),
        value
    });

    return value;
}

function average(values) {
    const finite = values.filter(Number.isFinite);

    if (!finite.length) {
        return null;
    }

    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function sum(values) {
    const finite = values.filter(Number.isFinite);

    if (!finite.length) {
        return null;
    }

    return finite.reduce((total, value) => total + value, 0);
}

function lastDayOfMonth(year, monthNumber) {
    return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function monthRange(month) {
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
        throw new Error("Month must use YYYY-MM format");
    }

    const [year, monthNumber] = month.split("-").map(Number);

    if (monthNumber < 1 || monthNumber > 12) {
        throw new Error("Invalid month");
    }

    const startDate = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDayOfMonth(year, monthNumber)).padStart(2, "0")}`;

    return { year, monthNumber, startDate, endDate };
}

function monthDistance(month) {
    const { year, monthNumber } = monthRange(month);
    const now = new Date();

    return (
        (year - now.getUTCFullYear()) * 12 +
        (monthNumber - 1 - now.getUTCMonth())
    );
}

function zipHourly(data) {
    const hourly = data.hourly ?? {};
    const times = hourly.time ?? [];

    return times.map((time, index) => ({
        time,
        temperature: hourly.temperature_2m?.[index] ?? null,
        precipitationProbability:
            hourly.precipitation_probability?.[index] ?? null,
        windSpeed: hourly.wind_speed_10m?.[index] ?? null
    }));
}

function zipDaily(data) {
    const daily = data.daily ?? {};
    const times = daily.time ?? [];

    return times.map((date, index) => ({
        date,
        temperatureMax: daily.temperature_2m_max?.[index] ?? null,
        temperatureMin: daily.temperature_2m_min?.[index] ?? null,
        precipitationProbability:
            daily.precipitation_probability_max?.[index] ?? null,
        precipitation: daily.precipitation_sum?.[index] ?? null,
        windSpeedMax: daily.wind_speed_10m_max?.[index] ?? null
    }));
}

export async function getLocationAnalytics(latitude, longitude) {
    const key = cacheKey("short", latitude, longitude);
    const cached = readCache(shortRangeCache, key, SHORT_RANGE_TTL);

    if (cached) {
        return cached;
    }

    const raw = await getShortRangeForecast(latitude, longitude);
    const value = {
        latitude: raw.latitude,
        longitude: raw.longitude,
        timezone: raw.timezone,
        timezoneAbbreviation: raw.timezone_abbreviation,
        utcOffsetSeconds: raw.utc_offset_seconds,
        hourly: zipHourly(raw),
        daily: zipDaily(raw),
        units: {
            temperature: "°C",
            precipitationProbability: "%",
            precipitation: "mm",
            windSpeed: "m/s"
        },
        source: "Open-Meteo Weather Forecast API"
    };

    return writeCache(shortRangeCache, key, value);
}

export async function getSeasonalProfile(latitude, longitude) {
    const key = cacheKey("seasonal", latitude, longitude);
    const cached = readCache(seasonalProfileCache, key, SEASONAL_TTL);

    if (cached) {
        return cached;
    }

    const raw = await getSeasonalProfileConditions(latitude, longitude);

    if (!raw) {
        throw new Error("No seasonal profile returned");
    }

    const monthly = raw.monthly ?? {};
    const times = monthly.time ?? [];

    const months = times.map((time, index) => ({
        month: String(time).slice(0, 7),
        temperature: monthly.temperature_2m_mean?.[index] ?? null,
        temperatureAnomaly: monthly.temperature_2m_anomaly?.[index] ?? null,
        precipitation: monthly.precipitation_mean?.[index] ?? null,
        precipitationAnomaly: monthly.precipitation_anomaly?.[index] ?? null,
        windSpeed: monthly.wind_speed_10m_mean?.[index] ?? null,
        windSpeedAnomaly: monthly.wind_speed_10m_anomaly?.[index] ?? null
    }));

    const value = {
        latitude: raw.latitude,
        longitude: raw.longitude,
        months,
        model: "ECMWF SEAS5 ensemble mean",
        source: "Open-Meteo / ECMWF",
        note: "Seasonal values describe broad monthly conditions. They are not exact day-by-day local predictions."
    };

    return writeCache(seasonalProfileCache, key, value);
}

export async function getHistoricalMonthSummary(latitude, longitude, month) {
    const key = cacheKey("history-month", latitude, longitude, month);
    const cached = readCache(historicalCache, key, HISTORICAL_TTL);

    if (cached) {
        return cached;
    }

    const { startDate, endDate } = monthRange(month);
    const raw = await getHistoricalDaily(
        latitude,
        longitude,
        startDate,
        endDate
    );

    const daily = raw.daily ?? {};
    const temperatures = daily.temperature_2m_mean ?? [];
    const precipitation = daily.precipitation_sum ?? [];
    const wind = daily.wind_speed_10m_mean ?? [];

    const value = {
        month,
        latitude: raw.latitude,
        longitude: raw.longitude,
        meanTemperature: average(temperatures),
        meanDailyMaximum: average(daily.temperature_2m_max ?? []),
        meanDailyMinimum: average(daily.temperature_2m_min ?? []),
        totalPrecipitation: sum(precipitation),
        meanWindSpeed: average(wind),
        source: "Open-Meteo Historical Weather API"
    };

    return writeCache(historicalCache, key, value);
}

export async function getHistoricalTemperatureSeries(
    latitude,
    longitude,
    calendarMonth,
    years = 10
) {
    const monthNumber = Number(calendarMonth);
    const safeYears = Math.min(30, Math.max(2, Number(years) || 10));

    if (monthNumber < 1 || monthNumber > 12) {
        throw new Error("calendarMonth must be between 1 and 12");
    }

    const now = new Date();
    const lastYear = now.getUTCFullYear() - 1;
    const firstYear = lastYear - safeYears + 1;
    const startDate = `${firstYear}-01-01`;
    const endDate = `${lastYear}-12-31`;
    const key = cacheKey(
        "history-series",
        latitude,
        longitude,
        monthNumber,
        safeYears
    );
    const cached = readCache(historicalCache, key, HISTORICAL_TTL);

    if (cached) {
        return cached;
    }

    const raw = await getHistoricalDaily(
        latitude,
        longitude,
        startDate,
        endDate
    );

    const daily = raw.daily ?? {};
    const grouped = new Map();

    (daily.time ?? []).forEach((date, index) => {
        const [year, month] = String(date).split("-").map(Number);

        if (month !== monthNumber) {
            return;
        }

        if (!grouped.has(year)) {
            grouped.set(year, []);
        }

        grouped.get(year).push(daily.temperature_2m_mean?.[index]);
    });

    const points = [...grouped.entries()]
        .map(([year, values]) => ({
            year,
            temperature: average(values)
        }))
        .filter((point) => Number.isFinite(point.temperature))
        .sort((a, b) => a.year - b.year);

    const value = {
        calendarMonth: monthNumber,
        years: safeYears,
        latitude: raw.latitude,
        longitude: raw.longitude,
        points,
        source: "Open-Meteo Historical Weather API"
    };

    return writeCache(historicalCache, key, value);
}

async function getComparableMonth(latitude, longitude, month) {
    const distance = monthDistance(month);

    if (distance >= 0 && distance <= 6) {
        const forecast = await getSeasonalForecastForLocation(
            latitude,
            longitude,
            month
        );

        return {
            month,
            kind: "seasonal-forecast",
            temperature: forecast.temperature,
            anomaly: forecast.anomaly,
            source: forecast.source
        };
    }

    if (distance < 0) {
        const historical = await getHistoricalMonthSummary(
            latitude,
            longitude,
            month
        );

        return {
            month,
            kind: "historical",
            temperature: historical.meanTemperature,
            anomaly: null,
            source: historical.source
        };
    }

    throw new Error(
        `${month} is outside the available seasonal forecast horizon`
    );
}

export async function compareMonths(
    latitude,
    longitude,
    firstMonth,
    secondMonth
) {
    const [first, second] = await Promise.all([
        getComparableMonth(latitude, longitude, firstMonth),
        getComparableMonth(latitude, longitude, secondMonth)
    ]);

    return {
        first,
        second,
        difference:
            Number.isFinite(first.temperature) && Number.isFinite(second.temperature)
                ? second.temperature - first.temperature
                : null
    };
}

export async function compareLocations(
    first,
    second,
    mode = "realtime"
) {
    if (mode === "forecast") {
        const [firstProfile, secondProfile] = await Promise.all([
            getSeasonalProfile(first.latitude, first.longitude),
            getSeasonalProfile(second.latitude, second.longitude)
        ]);

        return {
            mode: "forecast",
            first: firstProfile,
            second: secondProfile
        };
    }

    const [firstAnalytics, secondAnalytics] = await Promise.all([
        getLocationAnalytics(first.latitude, first.longitude),
        getLocationAnalytics(second.latitude, second.longitude)
    ]);

    return {
        mode: "realtime",
        first: firstAnalytics,
        second: secondAnalytics
    };
}
