import {
    getSatelliteTile,
    getTerrainTile,
    satelliteBasemapConfigured,
    terrainBasemapConfigured
} from "../providers/mapTilerSatelliteProvider.js";

export function getBasemapStatus(req, res) {
    res.json({
        terrain: {
            available: terrainBasemapConfigured(),
            provider: "MapTiler",
            map: "landscape-v4"
        },
        satellite: {
            available: satelliteBasemapConfigured(),
            provider: "MapTiler",
            tileset: "satellite-v2",
            fallbackTileset: "satellite-v4"
        }
    });
}

function sendTile(res, tile, cacheHeader) {
    res.setHeader("Content-Type", tile.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader(cacheHeader, tile.cacheStatus);
    res.send(tile.buffer);
}

export async function getSatelliteBasemapTile(req, res) {
    const zoom = Number(req.params.z);
    const tileX = Number(req.params.x);
    const tileY = Number(req.params.y);

    try {
        sendTile(res, await getSatelliteTile(zoom, tileX, tileY), "X-Satellite-Tile-Cache");
    } catch (error) {
        console.error(error);
        res.status(error?.status || 502).json({
            error: error?.message || "Failed to retrieve satellite tile"
        });
    }
}

export async function getTerrainBasemapTile(req, res) {
    const zoom = Number(req.params.z);
    const tileX = Number(req.params.x);
    const tileY = Number(req.params.y);

    try {
        sendTile(res, await getTerrainTile(zoom, tileX, tileY), "X-Terrain-Tile-Cache");
    } catch (error) {
        console.error(error);
        res.status(error?.status || 502).json({
            error: error?.message || "Failed to retrieve terrain tile"
        });
    }
}
