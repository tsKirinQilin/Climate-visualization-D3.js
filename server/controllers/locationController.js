import { findLocations } from "../services/locationService.js";

export async function searchLocations(req, res) {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({
            error: "Search query is required"
        });
    }

    try {
        const locations = await findLocations(q);

        res.json(locations);
    } catch (error) {
        console.error(error);

        res.status(502).json({
            error: "Failed to retrieve location data"
        });
    }
}