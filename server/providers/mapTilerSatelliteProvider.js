const TILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TILE_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TILE_CACHE_ENTRIES = 700;

const tileCache = new Map();
const tileInFlight = new Map();

function cacheKey(style, z, x, y) {
    return `${style}:${z}:${x}:${y}`;
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
        z <= 20 &&
        x >= 0 &&
        x < tileCount &&
        y >= 0 &&
        y < tileCount
    );
}

export function satelliteBasemapConfigured() {
    return Boolean(process.env.MAPTILER_API_KEY?.trim());
}

export function terrainBasemapConfigured() {
    return satelliteBasemapConfigured();
}

function mapTilerUrls(style, z, x, y, apiKey) {
    const encodedKey = encodeURIComponent(apiKey);

    if (style === "terrain") {
        // Landscape v4 gives a restrained terrain/hillshade base that works
        // well under colourful weather overlays. Topo/Outdoor are fallbacks.
        return [
            `https://api.maptiler.com/maps/landscape-v4/256/${z}/${x}/${y}.png?key=${encodedKey}`,
            `https://api.maptiler.com/maps/topo-v4/256/${z}/${x}/${y}.png?key=${encodedKey}`,
            `https://api.maptiler.com/maps/outdoor-v4/256/${z}/${x}/${y}.png?key=${encodedKey}`
        ];
    }

    return [
        `https://api.maptiler.com/tiles/satellite-v2/${z}/${x}/${y}.jpg?key=${encodedKey}`,
        `https://api.maptiler.com/tiles/satellite-v4/${z}/${x}/${y}?key=${encodedKey}`,
        `https://api.maptiler.com/maps/satellite-v4/256/${z}/${x}/${y}.jpg?key=${encodedKey}`
    ];
}

async function fetchOne(url, label) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: {
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
    });

    if (response.status === 204) {
        const error = new Error(`${label} tile is empty`);
        error.status = 204;
        throw error;
    }

    if (!response.ok) {
        const error = new Error(`MapTiler ${label} tile request failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) {
        const error = new Error(`MapTiler returned non-image content: ${contentType}`);
        error.status = 502;
        throw error;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength) {
        const error = new Error(`MapTiler returned an empty ${label} tile`);
        error.status = 502;
        throw error;
    }

    return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
        fetchedAt: Date.now()
    };
}

async function fetchTile(style, z, x, y) {
    const apiKey = process.env.MAPTILER_API_KEY?.trim();
    if (!apiKey) {
        const error = new Error("MAPTILER_API_KEY is not configured");
        error.status = 503;
        throw error;
    }

    let lastError = null;
    for (const url of mapTilerUrls(style, z, x, y, apiKey)) {
        try {
            return await fetchOne(url, style);
        } catch (error) {
            lastError = error;
            if (error?.status === 401 || error?.status === 403) break;
        }
    }

    throw lastError || new Error(`Failed to retrieve MapTiler ${style} tile`);
}

async function getTile(style, z, x, y) {
    if (!validTileCoordinate(z, x, y)) {
        const error = new Error("Invalid basemap tile coordinates");
        error.status = 400;
        throw error;
    }

    const key = cacheKey(style, z, x, y);
    const cached = tileCache.get(key);
    const now = Date.now();

    if (cached && now - cached.fetchedAt <= TILE_CACHE_TTL_MS) {
        return { ...cached, cacheStatus: "fresh" };
    }

    let request = tileInFlight.get(key);
    if (!request) {
        request = fetchTile(style, z, x, y)
            .then((tile) => {
                tileCache.delete(key);
                tileCache.set(key, tile);
                trimCache();
                return tile;
            })
            .finally(() => {
                if (tileInFlight.get(key) === request) tileInFlight.delete(key);
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

export function getSatelliteTile(z, x, y) {
    return getTile("satellite", z, x, y);
}

export function getTerrainTile(z, x, y) {
    return getTile("terrain", z, x, y);
}
