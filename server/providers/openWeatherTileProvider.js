const TILE_CACHE_TTL_MS = 10 * 60 * 1000;
const TILE_STALE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_TILE_CACHE_ENTRIES = 320;

const tileCache = new Map();
const tileInFlight = new Map();

function cacheKey(layer, z, x, y) {
    return `${layer}:${z}:${x}:${y}`;
}

function trimCache() {
    while (tileCache.size > MAX_TILE_CACHE_ENTRIES) {
        const firstKey = tileCache.keys().next().value;
        tileCache.delete(firstKey);
    }
}

function validTileCoordinate(z, x, y) {
    const tileCount = 2 ** z;
    return (
        Number.isInteger(z) &&
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        z >= 0 &&
        z <= 8 &&
        x >= 0 &&
        x < tileCount &&
        y >= 0 &&
        y < tileCount
    );
}

async function fetchTile(layer, z, x, y) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
        const error = new Error("OPENWEATHER_API_KEY is not configured");
        error.status = 503;
        throw error;
    }

    const url =
        `https://tile.openweathermap.org/map/${encodeURIComponent(layer)}` +
        `/${z}/${x}/${y}.png?appid=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
        const error = new Error(`OpenWeather tile request failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
        buffer,
        contentType: response.headers.get("content-type") || "image/png",
        fetchedAt: Date.now()
    };
}

export async function getWeatherTile(layer, z, x, y) {
    const allowedLayers = new Set(["precipitation_new"]);

    if (!allowedLayers.has(layer)) {
        const error = new Error("Unsupported weather tile layer");
        error.status = 400;
        throw error;
    }

    if (!validTileCoordinate(z, x, y)) {
        const error = new Error("Invalid weather tile coordinates");
        error.status = 400;
        throw error;
    }

    const key = cacheKey(layer, z, x, y);
    const cached = tileCache.get(key);
    const now = Date.now();

    if (cached && now - cached.fetchedAt <= TILE_CACHE_TTL_MS) {
        return { ...cached, cacheStatus: "fresh" };
    }

    let request = tileInFlight.get(key);
    if (!request) {
        request = fetchTile(layer, z, x, y)
            .then((tile) => {
                tileCache.delete(key);
                tileCache.set(key, tile);
                trimCache();
                return tile;
            })
            .finally(() => {
                if (tileInFlight.get(key) === request) {
                    tileInFlight.delete(key);
                }
            });
        tileInFlight.set(key, request);
    }

    try {
        const tile = await request;
        return { ...tile, cacheStatus: "live" };
    } catch (error) {
        if (cached && now - cached.fetchedAt <= TILE_STALE_TTL_MS) {
            return { ...cached, cacheStatus: "stale" };
        }
        throw error;
    }
}
