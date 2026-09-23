import { findLocations } from "./locationService.js";
import { getWeatherForLocation } from "./weatherService.js";
import {
    compareLocations,
    compareMonths,
    getHistoricalMonthSummary,
    getHistoricalTemperatureSeries,
    getLocationAnalytics,
    getSeasonalProfile
} from "./analyticsService.js";

function compactLocation(location) {
    return {
        name: location.name ?? "Selected location",
        country: location.country ?? null,
        state: location.state ?? null,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude)
    };
}

async function resolveLocation(locationQuery, context = {}) {
    if (locationQuery?.trim()) {
        const matches = await findLocations(locationQuery.trim());

        if (!matches.length) {
            throw new Error(`Location not found: ${locationQuery}`);
        }

        return compactLocation(matches[0]);
    }

    const latitude = Number(context.latitude);
    const longitude = Number(context.longitude);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
            name: context.locationName || "Selected map location",
            country: context.country || null,
            state: null,
            latitude,
            longitude
        };
    }

    throw new Error("No location was provided and no map location is selected");
}

function temperatureLine(title, points, seriesName = "Temperature") {
    return {
        type: "line",
        title,
        xType: "time",
        yLabel: "°C",
        series: [
            {
                name: seriesName,
                points
            }
        ]
    };
}

export const aiFunctionDeclarations = [
    {
        name: "get_current_weather",
        description: "Get verified current weather for a named location. Omit location to use the currently selected map location.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City or place name, for example Bishkek or Tokyo. Omit to use the selected map point."
                }
            }
        }
    },
    {
        name: "get_short_term_forecast",
        description: "Get the next 24 hours and 7-day forecast for a location, including temperature, precipitation probability and wind.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City or place name. Omit to use the selected map point."
                }
            }
        }
    },
    {
        name: "get_seasonal_outlook",
        description: "Get the available ECMWF SEAS5 monthly seasonal outlook for a location, including temperature, anomaly, precipitation and wind.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City or place name. Omit to use the selected map point."
                }
            }
        }
    },
    {
        name: "get_historical_month",
        description: "Get observed historical monthly weather statistics for one past calendar month.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City or place name. Omit to use the selected map point."
                },
                month: {
                    type: "string",
                    description: "Past month in YYYY-MM format."
                }
            },
            required: ["month"]
        }
    },
    {
        name: "compare_months",
        description: "Compare mean temperature for two months at one location. Past months use historical observations; supported future months use ECMWF seasonal forecasts. The backend calculates the difference.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City or place name. Omit to use the selected map point."
                },
                first_month: {
                    type: "string",
                    description: "First month in YYYY-MM format."
                },
                second_month: {
                    type: "string",
                    description: "Second month in YYYY-MM format."
                }
            },
            required: ["first_month", "second_month"]
        }
    },
    {
        name: "compare_locations",
        description: "Compare two named locations using either the 7-day forecast or the seasonal monthly outlook.",
        parameters: {
            type: "object",
            properties: {
                first_location: {
                    type: "string",
                    description: "First city or place."
                },
                second_location: {
                    type: "string",
                    description: "Second city or place."
                },
                mode: {
                    type: "string",
                    enum: ["realtime", "forecast"],
                    description: "realtime compares the next 7 days; forecast compares the seasonal monthly outlook."
                }
            },
            required: ["first_location", "second_location", "mode"]
        }
    },
    {
        name: "get_temperature_history",
        description: "Get a multi-year series of observed mean temperature for the same calendar month, useful for trend charts.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City or place name. Omit to use the selected map point."
                },
                calendar_month: {
                    type: "integer",
                    minimum: 1,
                    maximum: 12,
                    description: "Calendar month number from 1 to 12."
                },
                years: {
                    type: "integer",
                    minimum: 2,
                    maximum: 30,
                    description: "Number of complete past years to include."
                }
            },
            required: ["calendar_month"]
        }
    }
];

export async function executeAiTool(name, args = {}, context = {}) {
    if (name === "get_current_weather") {
        const location = await resolveLocation(args.location, context);
        const weather = await getWeatherForLocation(
            location.latitude,
            location.longitude
        );

        return {
            location,
            weather,
            sources: ["OpenWeather Current Weather API"]
        };
    }

    if (name === "get_short_term_forecast") {
        const location = await resolveLocation(args.location, context);
        const analytics = await getLocationAnalytics(
            location.latitude,
            location.longitude
        );
        const visualization = temperatureLine(
            `${location.name}: next 24 hours`,
            analytics.hourly
                .filter((point) => Number.isFinite(point.temperature))
                .map((point) => ({
                    x: point.time,
                    y: point.temperature
                }))
        );

        return {
            location,
            analytics,
            visualization,
            sources: [analytics.source]
        };
    }

    if (name === "get_seasonal_outlook") {
        const location = await resolveLocation(args.location, context);
        const profile = await getSeasonalProfile(
            location.latitude,
            location.longitude
        );
        const visualization = {
            type: "line",
            title: `${location.name}: seasonal outlook`,
            xType: "month",
            yLabel: "°C",
            series: [
                {
                    name: "Mean temperature",
                    points: profile.months
                        .filter((point) => Number.isFinite(point.temperature))
                        .map((point) => ({ x: point.month, y: point.temperature }))
                },
                {
                    name: "Temperature anomaly",
                    points: profile.months
                        .filter((point) => Number.isFinite(point.temperatureAnomaly))
                        .map((point) => ({ x: point.month, y: point.temperatureAnomaly }))
                }
            ]
        };

        return {
            location,
            profile,
            visualization,
            sources: [profile.source]
        };
    }

    if (name === "get_historical_month") {
        const location = await resolveLocation(args.location, context);
        const summary = await getHistoricalMonthSummary(
            location.latitude,
            location.longitude,
            args.month
        );

        return {
            location,
            summary,
            sources: [summary.source]
        };
    }

    if (name === "compare_months") {
        const location = await resolveLocation(args.location, context);
        const comparison = await compareMonths(
            location.latitude,
            location.longitude,
            args.first_month,
            args.second_month
        );
        const visualization = {
            type: "bar",
            title: `${location.name}: monthly temperature comparison`,
            yLabel: "°C",
            series: [
                {
                    name: "Mean temperature",
                    points: [
                        { x: comparison.first.month, y: comparison.first.temperature },
                        { x: comparison.second.month, y: comparison.second.temperature }
                    ]
                }
            ]
        };

        return {
            location,
            comparison,
            visualization,
            sources: [
                comparison.first.source,
                comparison.second.source
            ].filter(Boolean)
        };
    }

    if (name === "compare_locations") {
        const first = await resolveLocation(args.first_location, {});
        const second = await resolveLocation(args.second_location, {});
        const comparison = await compareLocations(
            first,
            second,
            args.mode === "forecast" ? "forecast" : "realtime"
        );

        let visualization;

        if (comparison.mode === "forecast") {
            visualization = {
                type: "line",
                title: `${first.name} vs ${second.name}: seasonal temperature`,
                xType: "month",
                yLabel: "°C",
                series: [
                    {
                        name: first.name,
                        points: comparison.first.months
                            .filter((point) => Number.isFinite(point.temperature))
                            .map((point) => ({ x: point.month, y: point.temperature }))
                    },
                    {
                        name: second.name,
                        points: comparison.second.months
                            .filter((point) => Number.isFinite(point.temperature))
                            .map((point) => ({ x: point.month, y: point.temperature }))
                    }
                ]
            };
        } else {
            const dailyTemperature = (item) =>
                Number.isFinite(item.temperatureMax) && Number.isFinite(item.temperatureMin)
                    ? (item.temperatureMax + item.temperatureMin) / 2
                    : null;

            visualization = {
                type: "line",
                title: `${first.name} vs ${second.name}: 7-day temperature`,
                xType: "date",
                yLabel: "°C",
                series: [
                    {
                        name: first.name,
                        points: comparison.first.daily
                            .map((point) => ({ x: point.date, y: dailyTemperature(point) }))
                            .filter((point) => Number.isFinite(point.y))
                    },
                    {
                        name: second.name,
                        points: comparison.second.daily
                            .map((point) => ({ x: point.date, y: dailyTemperature(point) }))
                            .filter((point) => Number.isFinite(point.y))
                    }
                ]
            };
        }

        return {
            firstLocation: first,
            secondLocation: second,
            comparison,
            visualization,
            sources: comparison.mode === "forecast"
                ? [comparison.first.source, comparison.second.source]
                : [comparison.first.source, comparison.second.source]
        };
    }

    if (name === "get_temperature_history") {
        const location = await resolveLocation(args.location, context);
        const history = await getHistoricalTemperatureSeries(
            location.latitude,
            location.longitude,
            args.calendar_month,
            args.years ?? 10
        );
        const visualization = {
            type: "line",
            title: `${location.name}: historical monthly temperature`,
            xType: "year",
            yLabel: "°C",
            series: [
                {
                    name: "Mean temperature",
                    points: history.points.map((point) => ({
                        x: String(point.year),
                        y: point.temperature
                    }))
                }
            ]
        };

        return {
            location,
            history,
            visualization,
            sources: [history.source]
        };
    }

    throw new Error(`Unknown AI tool: ${name}`);
}
