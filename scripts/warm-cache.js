import dotenv from "dotenv";
dotenv.config();

import { getRealtimeMapSnapshot, getForecastMapSnapshot, getRealtimePrecipitationPoints } from "../server/services/temperatureMapService.js";
import { getWeatherForLocation } from "../server/services/weatherService.js";
import { getLocationAnalytics, getSeasonalProfile } from "../server/services/analyticsService.js";
import { getSeasonalForecastForLocation } from "../server/services/seasonalForecastService.js";

const demoLocations = [
    { name: "Bishkek", latitude: 42.8746, longitude: 74.5698 },
    { name: "Beijing", latitude: 39.9042, longitude: 116.4074 },
    { name: "Delhi", latitude: 28.6139, longitude: 77.2090 },
    { name: "London", latitude: 51.5074, longitude: -0.1278 },
    { name: "New York", latitude: 40.7128, longitude: -74.0060 }
];

function monthOffset(offset) {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function safe(label, task) {
    try {
        await task();
        console.log(`✓ ${label}`);
    } catch (error) {
        console.warn(`! ${label}: ${error.message}`);
    }
}

await safe("global realtime map", () => getRealtimeMapSnapshot());

for (let offset = 0; offset <= 6; offset += 1) {
    const month = monthOffset(offset);
    await safe(`forecast map ${month}`, () => getForecastMapSnapshot(month));
}

for (const location of demoLocations) {
    await safe(`${location.name} current weather`, () => getWeatherForLocation(location.latitude, location.longitude));
    await safe(`${location.name} short-range analytics`, () => getLocationAnalytics(location.latitude, location.longitude));
    await safe(`${location.name} seasonal profile`, () => getSeasonalProfile(location.latitude, location.longitude));
    await safe(`${location.name} precipitation detail`, () => getRealtimePrecipitationPoints(location.latitude, location.longitude, 2));

    for (let offset = 0; offset <= 2; offset += 1) {
        const month = monthOffset(offset);
        await safe(`${location.name} seasonal point ${month}`, () =>
            getSeasonalForecastForLocation(location.latitude, location.longitude, month)
        );
    }
}

console.log("Cache warm-up finished. Presentation snapshots are ready to commit in server/cache/presentation.");
