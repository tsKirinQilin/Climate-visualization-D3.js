import { fetchJsonWithRetry } from "../utils/fetchJson.js";

const CURRENT_API_URL = "https://api.open-meteo.com/v1/forecast";
const SEASONAL_API_URL = "https://seasonal-api.open-meteo.com/v1/seasonal";
const BATCH_SIZE = 60;

const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

let seasonalRequestQueue = Promise.resolve();

function splitIntoBatches(points) {
    const batches = [];

    for (let index = 0; index < points.length; index += BATCH_SIZE) {
        batches.push(points.slice(index, index + BATCH_SIZE));
    }

    return batches;
}

function coordinateList(points, field) {
    return points.map((point) => point[field]).join(",");
}

function normalizeResponse(data) {
    return Array.isArray(data) ? data : [data];
}

function enqueueSeasonalRequest(task) {
    const request = seasonalRequestQueue.then(task);
    seasonalRequestQueue = request.catch(() => {});
    return request;
}

function monthDateRange(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const startDate = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const endDate = `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    return { startDate, endDate };
}

export async function getCurrentMapConditions(points) {
    const batches = splitIntoBatches(points);
    const responses = [];

    // Run global-map batches sequentially. This is slightly slower than
    // Promise.all, but much more reliable on free APIs and flaky networks.
    for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const latitudes = coordinateList(batch, "latitude");
        const longitudes = coordinateList(batch, "longitude");

        const url =
            `${CURRENT_API_URL}` +
            `?latitude=${encodeURIComponent(latitudes)}` +
            `&longitude=${encodeURIComponent(longitudes)}` +
            `&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m` +
            `&wind_speed_unit=ms` +
            `&cell_selection=nearest` +
            `&timezone=UTC`;

        const data = await fetchJsonWithRetry(url, {
            label: "Open-Meteo realtime map request failed",
            retries: 3,
            baseDelayMs: 900
        });

        responses.push(...normalizeResponse(data));

        if (index < batches.length - 1) {
            await sleep(120);
        }
    }

    return responses;
}

export async function getCurrentPrecipitationConditions(points) {
    const batches = splitIntoBatches(points);
    const responses = [];

    for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const latitudes = coordinateList(batch, "latitude");
        const longitudes = coordinateList(batch, "longitude");

        const url =
            `${CURRENT_API_URL}` +
            `?latitude=${encodeURIComponent(latitudes)}` +
            `&longitude=${encodeURIComponent(longitudes)}` +
            `&current=precipitation` +
            `&precipitation_unit=mm` +
            `&timezone=UTC`;

        const data = await fetchJsonWithRetry(url, {
            label: "Open-Meteo realtime precipitation request failed",
            retries: 2,
            baseDelayMs: 900
        });

        responses.push(...normalizeResponse(data));

        if (index < batches.length - 1) {
            await sleep(250);
        }
    }

    return responses;
}

async function getSeasonalMapConditionsInternal(points, month) {
    const batches = splitIntoBatches(points);
    const { startDate, endDate } = monthDateRange(month);
    const responses = [];

    for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const latitudes = coordinateList(batch, "latitude");
        const longitudes = coordinateList(batch, "longitude");

        const url =
            `${SEASONAL_API_URL}` +
            `?latitude=${encodeURIComponent(latitudes)}` +
            `&longitude=${encodeURIComponent(longitudes)}` +
            `&monthly=temperature_2m_mean,temperature_2m_anomaly,precipitation_mean,precipitation_anomaly,wind_speed_10m_mean,wind_speed_10m_anomaly` +
            `&models=ecmwf_seas5_ensemble_mean` +
            `&wind_speed_unit=ms` +
            `&cell_selection=nearest` +
            `&start_date=${startDate}` +
            `&end_date=${endDate}` +
            `&timezone=UTC`;

        const data = await fetchJsonWithRetry(url, {
            label: "Open-Meteo seasonal map request failed",
            retries: 4,
            baseDelayMs: 1500
        });

        responses.push(...normalizeResponse(data));

        if (index < batches.length - 1) {
            await sleep(200);
        }
    }

    return responses;
}

export function getSeasonalMapConditions(points, month) {
    return enqueueSeasonalRequest(() =>
        getSeasonalMapConditionsInternal(points, month)
    );
}

export function getSeasonalProfileConditions(latitude, longitude) {
    return enqueueSeasonalRequest(async () => {
        const now = new Date();
        const startDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
        const end = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() + 7,
            0
        ));
        const endDate = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;

        const url =
            `${SEASONAL_API_URL}` +
            `?latitude=${latitude}` +
            `&longitude=${longitude}` +
            `&monthly=temperature_2m_mean,temperature_2m_anomaly,precipitation_mean,precipitation_anomaly,wind_speed_10m_mean,wind_speed_10m_anomaly` +
            `&models=ecmwf_seas5_ensemble_mean` +
            `&wind_speed_unit=ms` +
            `&start_date=${startDate}` +
            `&end_date=${endDate}` +
            `&timezone=UTC`;

        const data = await fetchJsonWithRetry(url, {
            label: "Open-Meteo seasonal profile request failed",
            retries: 4,
            baseDelayMs: 1500
        });

        return normalizeResponse(data)[0];
    });
}
