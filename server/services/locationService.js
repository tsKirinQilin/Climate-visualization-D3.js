import { searchLocations } from "../providers/openMeteoGeocodingProvider.js";

export async function findLocations(query) {
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