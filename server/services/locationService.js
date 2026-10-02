import { searchLocations } from "../providers/openMeteoGeocodingProvider.js";
import { getWithPersistentFallback } from "../utils/persistentCache.js";

const GEOCODING_TTL = 7 * 24 * 60 * 60 * 1000;

export async function findLocations(query) {
    const normalized = String(query ?? "").trim().toLowerCase();

    const result = await getWithPersistentFallback({
        namespace: "geocoding",
        key: normalized || "empty",
        ttlMs: GEOCODING_TTL,
        maxWaitMs: 5000,
        loadFresh: async () => {
            const locations = await searchLocations(query);
            return locations.map((location) => ({
                name: location.name,
                country: location.country_code,
                state: location.admin1 ?? null,
                latitude: location.latitude,
                longitude: location.longitude,
                timezone: location.timezone
            }));
        }
    });

    return result.data;
}
