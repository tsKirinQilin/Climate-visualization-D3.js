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

async function requestJson(url, errorLabel, maxRetries = 5) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const response = await fetch(url);

        if (response.ok) {
            return response.json();
        }

        const canRetry = response.status === 429 || response.status === 503;

        if (!canRetry || attempt === maxRetries) {
            throw new Error(`${errorLabel}: ${response.status}`);
        }

        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSeconds = Number(retryAfterHeader);
        const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 1500 * Math.pow(2, attempt);

        console.log(`Open-Meteo rate limit. Retrying in ${delay} ms...`);
        await sleep(delay);
    }

    throw new Error(errorLabel);
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

    const responses = await Promise.all(
        batches.map(async (batch) => {
            const latitudes = coordinateList(batch, "latitude");
            const longitudes = coordinateList(batch, "longitude");

            const url =
                `${CURRENT_API_URL}` +
                `?latitude=${encodeURIComponent(latitudes)}` +
                `&longitude=${encodeURIComponent(longitudes)}` +
                `&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m` +
                `&wind_speed_unit=ms` +
                `&timezone=UTC`;

            const data = await requestJson(
                url,
                "Open-Meteo realtime map request failed"
            );

            return normalizeResponse(data);
        })
    );

    return responses.flat();
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

        const data = await requestJson(
            url,
            "Open-Meteo realtime precipitation request failed",
            2
        );

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
            `&start_date=${startDate}` +
            `&end_date=${endDate}` +
            `&timezone=UTC`;

        const data = await requestJson(
            url,
            "Open-Meteo seasonal map request failed"
        );

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

        const data = await requestJson(
            url,
            "Open-Meteo seasonal profile request failed"
        );

        return normalizeResponse(data)[0];
    });
}
