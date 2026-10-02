const mapWidth = 960;
const mapHeight = 500;
const CITY_DATA_URL =
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_populated_places_simple.geojson";

let projection;
let path;
let landFeature;
let countries = [];
let mapMode = "realtime";
let mapMetric = "temperature";
let selectedForecastMonth = null;
let currentMapPoints = [];
let realtimeBasePoints = [];
let realtimePrecipitationPoints = [];
let realtimePrecipitationDetailPoints = [];
let selectedLocation = null;
let compareModeActive = false;
let compareBaseLocation = null;
let initialUrlLocation = null;
let hoverWeatherTimer;
let forecastChangeTimer;
let precipitationDetailTimer;
let precipitationDetailRequestId = 0;
let hoverRequestId = 0;
let windAnimationFrame = null;
let windLastFrame = 0;
let windParticles = [];
let windLines;
let cityGroup;
let windFieldRenderFrame = null;
let windFieldLastRenderAt = 0;
let forceNextWindFieldRender = false;
let forecastPrecipitationAnomalyMax = 4;
let baseMapMode = "standard";
let terrainBasemapAvailable = false;
let satelliteBasemapAvailable = false;
let satelliteRenderTimer = null;
let temperatureFieldRenderFrame = null;
let temperatureFieldLastRenderAt = 0;
let forceNextTemperatureFieldRender = false;
const gridLookupCache = new WeakMap();
let hoveredCountryName = null;
const rainTilePixelCache = new Map();

const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
const MAP_TRANSITION_MS = prefersReducedMotion ? 0 : 760;
const MAP_FAST_TRANSITION_MS = prefersReducedMotion ? 0 : 260;

function mapTransition(selection, duration = MAP_TRANSITION_MS) {
    return selection
        .transition("climate-map")
        .duration(duration)
        .ease(d3.easeCubicInOut);
}

const realtimeButton = document.getElementById("realtime-mode-button");
const forecastButton = document.getElementById("forecast-mode-button");
const forecastMonthSelect = document.getElementById("forecast-month");
const legendTitle = document.getElementById("temperature-legend-title");
const resetMapButton = document.getElementById("reset-map-button");
const compareMapButton = document.getElementById("compare-map-button");
const temperatureMetricButton = document.getElementById("temperature-metric-button");
const precipitationMetricButton = document.getElementById("precipitation-metric-button");
const windMetricButton = document.getElementById("wind-metric-button");
const legendBar = document.querySelector(".temperature-legend-bar");
const legendLabels = document.querySelector(".temperature-legend-labels");
const mapDataMeta = document.getElementById("map-data-meta");
const standardBasemapButton = document.getElementById("standard-basemap-button");
const satelliteBasemapButton = document.getElementById("satellite-basemap-button");

const mapRoot = d3
    .select("#map")
    .style("position", "relative");

const loadingIndicator = mapRoot
    .append("div")
    .attr("class", "map-loading")
    .style("display", "none")
    .text("Loading map data…");

const errorIndicator = mapRoot
    .append("div")
    .attr("class", "map-error")
    .style("display", "none");

const mapTooltip = mapRoot
    .append("div")
    .attr("class", "map-tooltip")
    .style("position", "absolute")
    .style("display", "none")
    .style("opacity", 0)
    .style("pointer-events", "none")
    .style("z-index", "40")
    .style("background", "rgba(20, 20, 20, 0.9)")
    .style("color", "white")
    .style("padding", "7px 9px")
    .style("border-radius", "3px")
    .style("font-size", "12px");

const metricCursorTooltip = mapRoot
    .append("div")
    .attr("class", "metric-cursor-tooltip")
    .style("position", "absolute")
    .style("display", "none")
    .style("pointer-events", "none")
    .style("z-index", "45")
    .style("background", "rgba(17, 24, 39, 0.9)")
    .style("color", "white")
    .style("padding", "6px 8px")
    .style("border-radius", "3px")
    .style("font-size", "12px")
    .style("line-height", "1.3");

const satelliteSvg = mapRoot
    .append("svg")
    .attr("class", "satellite-basemap-svg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("width", "100%")
    .attr("aria-hidden", "true")
    .style("display", "none")
    .style("pointer-events", "none");

const satelliteViewportGroup = satelliteSvg
    .append("g")
    .attr("class", "satellite-viewport");

const satelliteTileGroup = satelliteViewportGroup
    .append("g")
    .attr("class", "satellite-tiles");

const satelliteAttribution = mapRoot
    .append("div")
    .attr("class", "satellite-attribution")
    .text("Map imagery © MapTiler © OpenStreetMap contributors");

const temperatureFieldCanvas = mapRoot
    .append("canvas")
    .attr("class", "temperature-field-canvas")
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .style("display", "none")
    .style("pointer-events", "none");

const temperatureFieldContext = temperatureFieldCanvas.node().getContext("2d");

const windFieldCanvas = mapRoot
    .append("canvas")
    .attr("class", "wind-field-canvas")
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .style("display", "none")
    .style("pointer-events", "none");

const windFieldContext = windFieldCanvas.node().getContext("2d");

const windParticleCanvas = mapRoot
    .append("canvas")
    .attr("class", "wind-particle-canvas")
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .style("display", "none")
    .style("pointer-events", "none");

const windParticleContext = windParticleCanvas.node().getContext("2d");

const mapSvg = mapRoot
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("width", "100%")
    .attr("aria-label", "Interactive global weather map");

// The primary D3 world is mirrored with SVG <use> copies so horizontal
// panning can continue across the antimeridian instead of exposing blank
// space. All copies share the same underlying data-driven DOM.
const mapViewportGroup = mapSvg.append("g").attr("class", "map-viewport");
const worldCopiesGroup = mapViewportGroup
    .append("g")
    .attr("class", "world-copies")
    .style("pointer-events", "none");
const mapGroup = mapViewportGroup
    .append("g")
    .attr("id", "climate-primary-world");
let projectedWorldWidth = null;

const temperatureColor = d3
    .scaleLinear()
    .domain([-35, -20, -10, 0, 10, 20, 30, 40, 50])
    .range([
        "#6d5acb",
        "#6f86df",
        "#72b6e8",
        "#58b7b0",
        "#2f9b68",
        "#f2c62b",
        "#f39a21",
        "#e94b27",
        "#a91324"
    ])
    .clamp(true);

const precipitationColor = d3
    .scaleSequential()
    .domain([0, 10])
    .interpolator(d3.interpolateBlues)
    .clamp(true);

const forecastPrecipitationAnomalyColor = d3
    .scaleDiverging()
    .domain([-forecastPrecipitationAnomalyMax, 0, forecastPrecipitationAnomalyMax])
    .interpolator(d3.interpolateRdBu)
    .clamp(true);

function realtimePrecipitationColor(value) {
    if (!Number.isFinite(value) || value < 0.05) {
        return "transparent";
    }

    // Current Open-Meteo precipitation is a short accumulation, so very
    // small amounts (for example 0.1 mm) should remain visually subtle.
    if (value < 0.2) return "#eff3ff";
    if (value < 0.5) return "#c6dbef";
    if (value < 1) return "#9ecae1";
    if (value < 2) return "#6baed6";
    if (value < 5) return "#3182bd";
    return "#08519c";
}

const windColor = d3
    .scaleLinear()
    .domain([0, 3, 6, 10, 15, 22, 30])
    .range([
        "#cfe8f3",
        "#78c8c4",
        "#3fae68",
        "#b7c83d",
        "#e5c23c",
        "#ee8b32",
        "#c94b3c"
    ])
    .clamp(true);

let temperatureGroup;
let rainTileGroup;
let cloudGroup;
let windGroup;
let countryBordersGroup;
let countryInteractionGroup;
let hoverCountry;

const selectionMarker = mapGroup
    .append("circle")
    .attr("r", 5)
    .attr("fill", "#dc2626")
    .attr("stroke", "white")
    .attr("stroke-width", 1.5)
    .attr("vector-effect", "non-scaling-stroke")
    .style("pointer-events", "none")
    .style("display", "none");

const comparisonMarker = mapGroup
    .append("circle")
    .attr("r", 5)
    .attr("fill", "#2563eb")
    .attr("stroke", "white")
    .attr("stroke-width", 1.5)
    .attr("vector-effect", "non-scaling-stroke")
    .style("pointer-events", "none")
    .style("display", "none");

function mercatorWorldWidth() {
    return projectedWorldWidth ?? (projection ? 2 * Math.PI * projection.scale() : mapWidth);
}

// Normalize any wrapped Mercator longitude back into the canonical
// [-180, 180) interval. This helper is shared by world-wrap panning,
// cursor tooltips, wind interpolation and map click handling.
function wrapLongitude(longitude) {
    if (!Number.isFinite(longitude)) {
        return longitude;
    }

    return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function clampVerticalPan(transform) {
    if (!projection) return transform;

    const north = projection([0, 85.05112878]);
    const south = projection([0, -85.05112878]);
    if (!north || !south) return transform;

    const minY = mapHeight - transform.k * south[1];
    const maxY = -transform.k * north[1];
    const y = minY <= maxY
        ? Math.max(minY, Math.min(maxY, transform.y))
        : (minY + maxY) / 2;

    if (Math.abs(y - transform.y) < 0.001) return transform;
    return d3.zoomIdentity.translate(transform.x, y).scale(transform.k);
}

// Keep the horizontal transform inside one canonical screen-width of the
// Mercator world. Because neighboring copies are visually identical, jumping
// by an exact world width is invisible but prevents x from growing without
// bound. Dynamic layers therefore only ever need the current world and its
// immediate neighbors, even after an arbitrarily long drag.
function normalizeHorizontalPan(transform) {
    if (!projection) return transform;

    const screenWorldWidth = mercatorWorldWidth() * transform.k;
    if (!Number.isFinite(screenWorldWidth) || screenWorldWidth <= 0) {
        return transform;
    }

    const half = screenWorldWidth / 2;
    const x = ((transform.x + half) % screenWorldWidth + screenWorldWidth) % screenWorldWidth - half;

    if (Math.abs(x - transform.x) < 0.001) return transform;
    return d3.zoomIdentity.translate(x, transform.y).scale(transform.k);
}

function normalizedMapTransform(transform) {
    return clampVerticalPan(normalizeHorizontalPan(transform));
}

function updateWorldCopies() {
    if (!projection) return;

    const width = mercatorWorldWidth();
    const indices = [-2, -1, 1, 2];

    worldCopiesGroup
        .selectAll("use.world-copy")
        .data(indices, (index) => index)
        .join(
            (enter) => enter
                .append("use")
                .attr("class", "world-copy")
                .attr("href", "#climate-primary-world"),
            (update) => update,
            (exit) => exit.remove()
        )
        .attr("href", "#climate-primary-world")
        .attr("transform", (index) => `translate(${index * width},0)`);
}

const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
        const transform = normalizedMapTransform(event.transform);
        if (
            Math.abs(transform.x - event.transform.x) > 0.001 ||
            Math.abs(transform.y - event.transform.y) > 0.001
        ) {
            mapSvg.node().__zoom = transform;
        }

        // Panning/zooming only changes transforms on the hot path. Expensive
        // city collision work and a full wind raster refresh happen after the
        // gesture (or at a throttled cadence for wind), keeping dragging fluid.
        mapViewportGroup.attr("transform", transform);
        satelliteViewportGroup.attr("transform", transform);

        if (terrainBasemapAvailable || satelliteBasemapAvailable) {
            clearTimeout(satelliteRenderTimer);
            satelliteRenderTimer = setTimeout(renderBasemapTiles, 140);
        }

        if (mapMetric === "temperature") {
            scheduleTemperatureFieldRender();
        }

        if (mapMetric === "wind") {
            scheduleWindFieldRender();
        }

        if (mapMode === "realtime" && mapMetric === "precipitation") {
            clearTimeout(precipitationDetailTimer);
            precipitationDetailTimer = setTimeout(renderRealtimePrecipitationTiles, 180);
        }
    })
    .on("end", () => {
        const transform = d3.zoomTransform(mapSvg.node());
        updateCityVisibility(transform.k);

        if (terrainBasemapAvailable || satelliteBasemapAvailable) {
            renderBasemapTiles();
        }

        if (mapMetric === "temperature") {
            forceNextTemperatureFieldRender = true;
            scheduleTemperatureFieldRender();
        }

        if (mapMetric === "wind") {
            forceNextWindFieldRender = true;
            scheduleWindFieldRender();
        }

        if (mapMode === "realtime" && mapMetric === "precipitation") {
            renderRealtimePrecipitationTiles();
        }
    });

mapSvg.call(zoom);

mapSvg
    .on("mousemove.metric-cursor", updateMetricCursorTooltip)
    .on("mouseleave.metric-cursor", () => metricCursorTooltip.style("display", "none"));

function formatMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);

    return new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function populateForecastMonths() {
    const now = new Date();
    const options = [];

    for (let offset = 0; offset <= 6; offset += 1) {
        const date = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() + offset,
            1
        ));

        const value = `${date.getUTCFullYear()}-${String(
            date.getUTCMonth() + 1
        ).padStart(2, "0")}`;

        options.push({
            value,
            label: new Intl.DateTimeFormat("en", {
                month: "long",
                year: "numeric",
                timeZone: "UTC"
            }).format(date)
        });
    }

    forecastMonthSelect.innerHTML = "";

    options.forEach((option, index) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        forecastMonthSelect.appendChild(element);

        if (index === 1) {
            element.selected = true;
        }
    });

    selectedForecastMonth =
        forecastMonthSelect.value || options[0]?.value;
}

function showLoading(message) {
    errorIndicator.style("display", "none");
    loadingIndicator.text(message).style("display", "block");
}

function hideLoading() {
    loadingIndicator.style("display", "none");
}

function showMapError(message) {
    errorIndicator
        .text(message)
        .style("display", "block");
}

function hideMapError() {
    errorIndicator.style("display", "none");
}

function updateMapDataMeta(sourceText, cache = null) {
    if (!mapDataMeta) {
        return;
    }

    const date = cache?.savedAt ? new Date(cache.savedAt) : new Date();
    const fetched = date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC"
    });

    const isCached = String(cache?.status ?? "").startsWith("cache");
    const ageMinutes = Number.isFinite(cache?.ageMs)
        ? Math.max(0, Math.round(cache.ageMs / 60000))
        : null;
    const freshness = isCached
        ? `cached${ageMinutes !== null ? ` · ${ageMinutes} min old` : ""}`
        : "live";

    mapDataMeta.textContent = `${sourceText} · ${freshness} · ${fetched} UTC`;
}

function updateForecastPrecipitationScale(points) {
    const values = points
        .map((point) => Math.abs(Number(point.precipitationAnomaly)))
        .filter(Number.isFinite)
        .sort(d3.ascending);

    const representative = values.length
        ? d3.quantileSorted(values, 0.9) ?? d3.max(values) ?? 4
        : 4;

    forecastPrecipitationAnomalyMax = Math.max(1, Math.min(12, representative));

    forecastPrecipitationAnomalyColor.domain([
        -forecastPrecipitationAnomalyMax,
        0,
        forecastPrecipitationAnomalyMax
    ]);
}

function metricValue(point) {
    if (mapMetric === "precipitation") {
        return mapMode === "forecast"
            ? point.precipitationAnomaly
            : point.precipitation;
    }

    if (mapMetric === "wind") {
        return point.windSpeed;
    }

    return point.temperature;
}

function metricColor(point) {
    const value = metricValue(point);

    if (!Number.isFinite(value)) {
        return "transparent";
    }

    if (mapMetric === "precipitation") {
        return mapMode === "realtime"
            ? realtimePrecipitationColor(value)
            : forecastPrecipitationAnomalyColor(value);
    }

    if (mapMetric === "wind") {
        return windColor(value);
    }

    return temperatureColor(value);
}

function animateLegendUpdate(background, labelsHtml, title) {
    const legend = d3.select("#temperature-legend");
    legend.interrupt("legend");

    const apply = () => {
        legendBar.style.background = background;
        legendLabels.innerHTML = labelsHtml;
        legendTitle.textContent = title;
    };

    if (prefersReducedMotion) {
        apply();
        return;
    }

    legend
        .transition("legend")
        .duration(120)
        .style("opacity", 0.25)
        .on("end", () => {
            apply();
            legend
                .transition("legend")
                .duration(260)
                .ease(d3.easeCubicOut)
                .style("opacity", 1);
        });
}

function updateMetricControls() {
    temperatureMetricButton.classList.toggle("active", mapMetric === "temperature");
    precipitationMetricButton.classList.toggle("active", mapMetric === "precipitation");
    windMetricButton.classList.toggle("active", mapMetric === "wind");

    if (mapMetric === "precipitation") {
        if (mapMode === "forecast") {
            const max = forecastPrecipitationAnomalyMax;
            const half = max / 2;

            animateLegendUpdate(
                "linear-gradient(to right, #b2182b, #ef8a62, #f7f7f7, #67a9cf, #2166ac)",
                `<span>${(-max).toFixed(1)}</span><span>${(-half).toFixed(1)}</span><span>0</span><span>+${half.toFixed(1)}</span><span>+${max.toFixed(1)} mm</span>`,
                `${formatMonth(selectedForecastMonth)} precipitation anomaly`
            );
        } else {
            animateLegendUpdate(
                "linear-gradient(to right, rgba(110,110,205,.18), rgba(80,80,225,.55), rgba(20,20,255,.95))",
                "<span>0.1</span><span>1</span><span>10</span><span>50</span><span>140+ mm</span>",
                "Current precipitation map"
            );
        }
        return;
    }

    if (mapMetric === "wind") {
        animateLegendUpdate(
            "linear-gradient(to right, #cfe8f3, #78c8c4, #3fae68, #b7c83d, #e5c23c, #ee8b32, #c94b3c)",
            "<span>0</span><span>5</span><span>10</span><span>15</span><span>25+ m/s</span>",
            mapMode === "forecast"
                ? `${formatMonth(selectedForecastMonth)} monthly mean wind`
                : "Current wind speed"
        );
        return;
    }

    animateLegendUpdate(
        "linear-gradient(to right, #6d5acb, #72b6e8, #58b7b0, #2f9b68, #f2c62b, #f39a21, #e94b27)",
        "<span>-30°</span><span>-10°</span><span>0°</span><span>20°</span><span>40°C</span>",
        mapMode === "forecast"
            ? `${formatMonth(selectedForecastMonth)} forecast mean`
            : "Current temperature"
    );
}

function renderTemperatureLayer(points) {
    const circles = temperatureGroup
        .selectAll(".temperature-point")
        .data(points, (point) => `${point.latitude}:${point.longitude}`);

    const joined = circles.join(
        (enter) => enter
            .append("circle")
            .attr("class", "temperature-point")
            .attr("cx", (point) => projection([point.longitude, point.latitude])?.[0])
            .attr("cy", (point) => projection([point.longitude, point.latitude])?.[1])
            .attr("r", 0)
            .attr("fill", (point) => metricColor(point))
            .attr("opacity", 0),
        (update) => update,
        (exit) => {
            mapTransition(exit, MAP_FAST_TRANSITION_MS)
                .attr("opacity", 0)
                .attr("r", 0)
                .remove();
            return exit;
        }
    );

    joined
        .interrupt("climate-map")
        .attr(
            "filter",
            mapMode === "realtime" && mapMetric === "precipitation"
                ? "url(#precipitation-blur)"
                : "url(#temperature-blur)"
        );

    mapTransition(joined)
        .attr("cx", (point) => projection([point.longitude, point.latitude])?.[0])
        .attr("cy", (point) => projection([point.longitude, point.latitude])?.[1])
        .attr("r", (point) =>
            mapMode === "realtime" && mapMetric === "precipitation"
                ? point.precipitationDetail ? 9 : 18
                : 39
        )
        .attrTween("fill", function(point) {
            const from = d3.color(d3.select(this).attr("fill")) ?? d3.color(metricColor(point));
            const to = d3.color(metricColor(point));
            if (!from || !to) {
                return () => metricColor(point);
            }
            const interpolate = d3.interpolateRgb(from, to);
            return (t) => interpolate(t);
        })
        .attr("opacity", (point) => {
            const value = metricValue(point);
            if (!Number.isFinite(value)) return 0;
            if (mapMetric === "precipitation" && mapMode === "realtime") {
                if (value < 0.05) return 0;
                return Math.min(0.9, 0.35 + (Math.min(value, 2) / 2) * 0.55);
            }
            return 0.82;
        });
}

function gridPointKey(latitude, longitude) {
    return `${Number(latitude).toFixed(4)}:${Number(longitude).toFixed(4)}`;
}

function regularGridLookup(points) {
    if (!Array.isArray(points) || !points.length) return null;

    const cached = gridLookupCache.get(points);
    if (cached) return cached;

    const latitudes = [...new Set(points
        .map((point) => Number(point.latitude))
        .filter(Number.isFinite))]
        .sort((a, b) => a - b);
    const longitudes = [...new Set(points
        .map((point) => Number(point.longitude))
        .filter(Number.isFinite))]
        .sort((a, b) => a - b);

    if (latitudes.length < 2 || longitudes.length < 2) return null;

    const longitudeDiffs = longitudes
        .slice(1)
        .map((value, index) => value - longitudes[index])
        .filter((value) => value > 0.0001);
    const longitudeStep = d3.median(longitudeDiffs);

    if (!Number.isFinite(longitudeStep) || longitudeStep <= 0) return null;

    const byCoordinate = new Map();
    for (const point of points) {
        byCoordinate.set(gridPointKey(point.latitude, point.longitude), point);
    }

    const lookup = {
        latitudes,
        longitudes,
        minLongitude: longitudes[0],
        longitudeStep,
        byCoordinate
    };
    gridLookupCache.set(points, lookup);
    return lookup;
}

function latitudeBracket(latitudes, latitude) {
    if (latitude <= latitudes[0]) return [latitudes[0], latitudes[0]];
    if (latitude >= latitudes.at(-1)) return [latitudes.at(-1), latitudes.at(-1)];

    let low = 0;
    let high = latitudes.length - 1;
    while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (latitudes[middle] <= latitude) low = middle;
        else high = middle;
    }
    return [latitudes[low], latitudes[high]];
}

function regularGridCell(longitude, latitude, points) {
    const lookup = regularGridLookup(points);
    if (!lookup) return null;

    const lon = wrapLongitude(longitude);
    const step = lookup.longitudeStep;
    const minLon = lookup.minLongitude;
    let longitudeIndex = Math.floor((lon - minLon) / step);
    longitudeIndex = Math.max(0, Math.min(lookup.longitudes.length - 1, longitudeIndex));

    const lon0 = lookup.longitudes[longitudeIndex];
    const lon1Virtual = lon0 + step;
    const lon1 = lon1Virtual >= 180 - 0.0001
        ? lookup.longitudes[0]
        : lookup.longitudes[Math.min(longitudeIndex + 1, lookup.longitudes.length - 1)];
    const [lat0, lat1] = latitudeBracket(lookup.latitudes, latitude);

    const p00 = lookup.byCoordinate.get(gridPointKey(lat0, lon0));
    const p10 = lookup.byCoordinate.get(gridPointKey(lat0, lon1));
    const p01 = lookup.byCoordinate.get(gridPointKey(lat1, lon0));
    const p11 = lookup.byCoordinate.get(gridPointKey(lat1, lon1));

    if (!p00 || !p10 || !p01 || !p11) return null;

    const x = step > 0 ? Math.max(0, Math.min(1, (lon - lon0) / step)) : 0;
    const y = lat1 !== lat0
        ? Math.max(0, Math.min(1, (latitude - lat0) / (lat1 - lat0)))
        : 0;

    return { p00, p10, p01, p11, x, y };
}

function bilinear(a00, a10, a01, a11, x, y) {
    const top = a00 * (1 - x) + a10 * x;
    const bottom = a01 * (1 - x) + a11 * x;
    return top * (1 - y) + bottom * y;
}

function interpolatedScalarSlow(longitude, latitude, points, accessor) {
    const nearest = [];
    const longitudeScale = Math.max(0.15, Math.cos(latitude * Math.PI / 180));

    for (const point of points) {
        const value = Number(accessor(point));
        if (!Number.isFinite(value)) continue;

        let longitudeDifference = point.longitude - longitude;
        if (longitudeDifference > 180) longitudeDifference -= 360;
        if (longitudeDifference < -180) longitudeDifference += 360;

        const latitudeDifference = point.latitude - latitude;
        const distanceSquared =
            Math.pow(longitudeDifference * longitudeScale, 2) +
            Math.pow(latitudeDifference, 2);

        if (distanceSquared < 0.000001) return value;

        const candidate = { value, distanceSquared };
        let inserted = false;
        for (let index = 0; index < nearest.length; index += 1) {
            if (distanceSquared < nearest[index].distanceSquared) {
                nearest.splice(index, 0, candidate);
                inserted = true;
                break;
            }
        }
        if (!inserted) nearest.push(candidate);
        if (nearest.length > 4) nearest.pop();
    }

    if (!nearest.length) return null;

    let weighted = 0;
    let totalWeight = 0;
    for (const item of nearest) {
        const weight = 1 / Math.max(item.distanceSquared, 0.01);
        weighted += item.value * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? weighted / totalWeight : null;
}

function interpolatedScalar(longitude, latitude, points, accessor) {
    const cell = regularGridCell(longitude, latitude, points);
    if (cell) {
        const values = [cell.p00, cell.p10, cell.p01, cell.p11].map((point) => Number(accessor(point)));
        if (values.every(Number.isFinite)) {
            return bilinear(values[0], values[1], values[2], values[3], cell.x, cell.y);
        }
    }

    return interpolatedScalarSlow(longitude, latitude, points, accessor);
}

function renderTemperatureField(points = currentMapPoints) {
    if (!projection || mapMetric !== "temperature") {
        temperatureFieldCanvas.style("display", "none");
        temperatureFieldContext.clearRect(0, 0, mapWidth, mapHeight);
        return;
    }

    const temperaturePoints = points.filter((point) => Number.isFinite(point.temperature));
    if (!temperaturePoints.length) {
        temperatureFieldCanvas.style("display", "none");
        return;
    }

    temperatureFieldCanvas.style("display", "block");
    temperatureFieldContext.clearRect(0, 0, mapWidth, mapHeight);

    const transform = d3.zoomTransform(mapSvg.node());
    const sampleWidth = 280;
    const sampleHeight = 154;
    const raster = document.createElement("canvas");
    raster.width = sampleWidth;
    raster.height = sampleHeight;
    const context = raster.getContext("2d");
    const image = context.createImageData(sampleWidth, sampleHeight);

    for (let py = 0; py < sampleHeight; py += 1) {
        for (let px = 0; px < sampleWidth; px += 1) {
            const screenX = ((px + 0.5) / sampleWidth) * mapWidth;
            const screenY = ((py + 0.5) / sampleHeight) * mapHeight;
            const mapPoint = transform.invert([screenX, screenY]);
            const coordinates = projection.invert(mapPoint);
            const index = (py * sampleWidth + px) * 4;

            if (!coordinates) {
                image.data[index + 3] = 0;
                continue;
            }

            const [rawLongitude, latitude] = coordinates;
            const longitude = wrapLongitude(rawLongitude);
            if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || latitude < -85.05112878 || latitude > 85.05112878) {
                image.data[index + 3] = 0;
                continue;
            }

            const value = interpolatedScalar(
                longitude,
                latitude,
                temperaturePoints,
                (point) => point.temperature
            );

            if (!Number.isFinite(value)) {
                image.data[index + 3] = 0;
                continue;
            }

            const color = d3.color(temperatureColor(value));
            image.data[index] = color?.r ?? 0;
            image.data[index + 1] = color?.g ?? 0;
            image.data[index + 2] = color?.b ?? 0;
            image.data[index + 3] = 232;
        }
    }

    context.putImageData(image, 0, 0);
    temperatureFieldContext.save();
    temperatureFieldContext.imageSmoothingEnabled = true;
    temperatureFieldContext.imageSmoothingQuality = "high";
    temperatureFieldContext.globalAlpha = baseMapMode === "satellite" ? 0.64 : 0.82;
    temperatureFieldContext.drawImage(
        raster,
        0,
        0,
        sampleWidth,
        sampleHeight,
        0,
        0,
        mapWidth,
        mapHeight
    );
    temperatureFieldContext.restore();
}

function scheduleTemperatureFieldRender() {
    if (temperatureFieldRenderFrame !== null) return;

    const elapsed = performance.now() - temperatureFieldLastRenderAt;
    if (!forceNextTemperatureFieldRender && elapsed < 90) return;

    temperatureFieldRenderFrame = requestAnimationFrame(() => {
        temperatureFieldRenderFrame = null;
        temperatureFieldLastRenderAt = performance.now();
        forceNextTemperatureFieldRender = false;
        renderTemperatureField(currentMapPoints);
    });
}

function renderWindField(points = currentMapPoints) {
    if (!projection || mapMetric !== "wind") {
        windFieldCanvas.style("display", "none");
        windFieldContext.clearRect(0, 0, mapWidth, mapHeight);
        return;
    }

    const windPoints = points.filter((point) => Number.isFinite(point.windSpeed));

    if (!windPoints.length) {
        windFieldCanvas.style("display", "none");
        return;
    }

    windFieldCanvas.style("display", "block");
    windFieldContext.clearRect(0, 0, mapWidth, mapHeight);

    const transform = d3.zoomTransform(mapSvg.node());
    const sampleWidth = 240;
    const sampleHeight = 132;
    const raster = document.createElement("canvas");
    raster.width = sampleWidth;
    raster.height = sampleHeight;
    const context = raster.getContext("2d");
    const image = context.createImageData(sampleWidth, sampleHeight);

    for (let py = 0; py < sampleHeight; py += 1) {
        for (let px = 0; px < sampleWidth; px += 1) {
            const screenX = ((px + 0.5) / sampleWidth) * mapWidth;
            const screenY = ((py + 0.5) / sampleHeight) * mapHeight;
            const mapPoint = transform.invert([screenX, screenY]);
            const coordinates = projection.invert(mapPoint);
            const index = (py * sampleWidth + px) * 4;

            if (!coordinates) {
                image.data[index + 3] = 0;
                continue;
            }

            const [rawLongitude, latitude] = coordinates;
            const longitude = wrapLongitude(rawLongitude);
            if (
                !Number.isFinite(longitude) ||
                !Number.isFinite(latitude) ||
                latitude < -85.05112878 ||
                latitude > 85.05112878
            ) {
                image.data[index + 3] = 0;
                continue;
            }

            const speed = interpolatedScalar(
                longitude,
                latitude,
                windPoints,
                (point) => point.windSpeed
            );

            if (!Number.isFinite(speed)) {
                image.data[index + 3] = 0;
                continue;
            }

            const color = d3.color(windColor(speed));
            image.data[index] = color?.r ?? 0;
            image.data[index + 1] = color?.g ?? 0;
            image.data[index + 2] = color?.b ?? 0;
            image.data[index + 3] = 228;
        }
    }

    context.putImageData(image, 0, 0);
    windFieldContext.save();
    windFieldContext.imageSmoothingEnabled = true;
    windFieldContext.imageSmoothingQuality = "high";
    windFieldContext.globalAlpha = 0.94;
    windFieldContext.drawImage(
        raster,
        0,
        0,
        sampleWidth,
        sampleHeight,
        0,
        0,
        mapWidth,
        mapHeight
    );
    windFieldContext.restore();
}

function scheduleWindFieldRender() {
    if (windFieldRenderFrame !== null) return;

    const elapsed = performance.now() - windFieldLastRenderAt;
    if (!forceNextWindFieldRender && elapsed < 90) return;

    windFieldRenderFrame = requestAnimationFrame(() => {
        windFieldRenderFrame = null;
        windFieldLastRenderAt = performance.now();
        forceNextWindFieldRender = false;
        renderWindField(currentMapPoints);
    });
}


function clampMercatorLatitude(latitude) {
    return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function longitudeToTileX(longitude, zoomLevel) {
    const count = 2 ** zoomLevel;
    return Math.floor(((longitude + 180) / 360) * count);
}

function latitudeToTileY(latitude, zoomLevel) {
    const count = 2 ** zoomLevel;
    const lat = clampMercatorLatitude(latitude) * Math.PI / 180;
    return Math.floor(
        (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * count
    );
}

function tileXToLongitude(x, zoomLevel) {
    return x / (2 ** zoomLevel) * 360 - 180;
}

function tileYToLatitude(y, zoomLevel) {
    const n = Math.PI - 2 * Math.PI * y / (2 ** zoomLevel);
    return 180 / Math.PI * Math.atan(Math.sinh(n));
}

function realtimeRainTileZoom() {
    const scale = d3.zoomTransform(mapSvg.node()).k;
    return Math.max(2, Math.min(5, 2 + Math.floor(Math.log2(Math.max(1, scale)))));
}

function unwrappedMercatorCoordinates(screenPoint, transform = d3.zoomTransform(mapSvg.node())) {
    if (!projection) return null;

    const mapPoint = transform.invert(screenPoint);
    const centerX = projection([0, 0])?.[0] ?? projection.translate()[0];
    const longitude = ((mapPoint[0] - centerX) / projection.scale()) * 180 / Math.PI;
    const latitudeCoordinates = projection.invert([centerX, mapPoint[1]]);

    if (!latitudeCoordinates) return null;
    return [longitude, latitudeCoordinates[1]];
}

function visibleGeographicBounds() {
    const transform = d3.zoomTransform(mapSvg.node());
    const corners = [
        [0, 0],
        [mapWidth, 0],
        [0, mapHeight],
        [mapWidth, mapHeight]
    ]
        .map((point) => unwrappedMercatorCoordinates(point, transform))
        .filter(Boolean);

    if (!corners.length) {
        return { west: -180, east: 180, north: 85, south: -85 };
    }

    const longitudes = corners.map(([longitude]) => longitude);
    const latitudes = corners.map(([, latitude]) => latitude);

    return {
        west: d3.min(longitudes) ?? -180,
        east: d3.max(longitudes) ?? 180,
        north: Math.min(85.05112878, d3.max(latitudes) ?? 85),
        south: Math.max(-85.05112878, d3.min(latitudes) ?? -85)
    };
}

function mercatorTilesForViewport(zoomLevel) {
    const tileCount = 2 ** zoomLevel;
    const bounds = visibleGeographicBounds();

    let minRawX = Math.floor(((bounds.west + 180) / 360) * tileCount) - 1;
    let maxRawX = Math.floor(((bounds.east + 180) / 360) * tileCount) + 1;
    let minY = latitudeToTileY(bounds.north, zoomLevel) - 1;
    let maxY = latitudeToTileY(bounds.south, zoomLevel) + 1;

    // A world-wrap viewport never needs more than roughly two full copies.
    // This guard prevents accidental huge tile bursts after extreme drags.
    const maxHorizontalTiles = tileCount * 2 + 4;
    if (maxRawX - minRawX + 1 > maxHorizontalTiles) {
        const center = Math.round((minRawX + maxRawX) / 2);
        minRawX = center - Math.floor(maxHorizontalTiles / 2);
        maxRawX = minRawX + maxHorizontalTiles - 1;
    }

    minY = Math.max(0, minY);
    maxY = Math.min(tileCount - 1, maxY);

    const tiles = [];
    const width = mercatorWorldWidth();

    for (let y = minY; y <= maxY; y += 1) {
        for (let rawX = minRawX; rawX <= maxRawX; rawX += 1) {
            const wrappedX = ((rawX % tileCount) + tileCount) % tileCount;
            const worldIndex = Math.floor(rawX / tileCount);
            const west = tileXToLongitude(wrappedX, zoomLevel);
            const east = tileXToLongitude(wrappedX + 1, zoomLevel);
            const north = tileYToLatitude(y, zoomLevel);
            const south = tileYToLatitude(y + 1, zoomLevel);
            const topLeft = projection([west, north]);
            const bottomRight = projection([east, south]);

            if (!topLeft || !bottomRight) continue;

            tiles.push({
                key: `${zoomLevel}:${rawX}:${y}`,
                cacheKey: `${zoomLevel}:${wrappedX}:${y}`,
                z: zoomLevel,
                x: wrappedX,
                y,
                screenX: topLeft[0] + worldIndex * width,
                screenY: topLeft[1],
                width: Math.max(0.1, bottomRight[0] - topLeft[0]),
                height: Math.max(0.1, bottomRight[1] - topLeft[1])
            });
        }
    }

    return tiles;
}


function precipitationTilesForViewport() {
    return mercatorTilesForViewport(realtimeRainTileZoom());
}

function basemapTileZoom() {
    const scale = d3.zoomTransform(mapSvg.node()).k;
    return Math.max(2, Math.min(8, 2 + Math.floor(Math.log2(Math.max(1, scale)))));
}

function basemapTilesForViewport() {
    return mercatorTilesForViewport(basemapTileZoom());
}

function activeBasemapAvailable() {
    return baseMapMode === "satellite"
        ? satelliteBasemapAvailable
        : terrainBasemapAvailable;
}

function basemapTileUrl(tile) {
    const style = baseMapMode === "satellite" ? "satellite" : "terrain";
    return `/api/basemap/${style}/${tile.z}/${tile.x}/${tile.y}`;
}

function renderBasemapTiles() {
    if (!projection || !activeBasemapAvailable()) {
        satelliteSvg.style("display", "none");
        return;
    }

    satelliteSvg.style("display", "block");
    satelliteViewportGroup.attr("transform", d3.zoomTransform(mapSvg.node()));

    const tiles = basemapTilesForViewport();
    const images = satelliteTileGroup
        .selectAll("image.basemap-tile")
        .data(tiles, (tile) => `${baseMapMode}:${tile.key}`);

    images.join(
        (enter) => enter
            .append("image")
            .attr("class", "basemap-tile")
            .attr("preserveAspectRatio", "none")
            .attr("opacity", 0)
            .attr("href", basemapTileUrl)
            .attr("x", (tile) => tile.screenX)
            .attr("y", (tile) => tile.screenY)
            .attr("width", (tile) => tile.width + 0.8)
            .attr("height", (tile) => tile.height + 0.8)
            .on("error.basemap", () => {
                if (baseMapMode === "satellite") {
                    showMapError("Satellite imagery is temporarily unavailable — weather data is still active");
                }
            })
            .call((selection) => mapTransition(selection, MAP_FAST_TRANSITION_MS).attr("opacity", 1)),
        (update) => update
            .attr("href", basemapTileUrl)
            .attr("x", (tile) => tile.screenX)
            .attr("y", (tile) => tile.screenY)
            .attr("width", (tile) => tile.width + 0.8)
            .attr("height", (tile) => tile.height + 0.8)
            .attr("opacity", 1),
        (exit) => exit.remove()
    );
}

function applyBasemapStyling() {
    const satellite = baseMapMode === "satellite" && satelliteBasemapAvailable;
    const terrain = baseMapMode === "standard" && terrainBasemapAvailable;
    const hasRasterBasemap = satellite || terrain;

    mapRoot.classed("satellite-basemap-active", satellite);
    mapRoot.classed("terrain-basemap-active", terrain);
    satelliteSvg.style("display", hasRasterBasemap ? "block" : "none");
    satelliteAttribution
        .style("display", hasRasterBasemap ? "block" : "none")
        .text(satellite
            ? "Satellite imagery © MapTiler"
            : "Terrain map © MapTiler © OpenStreetMap contributors");

    rainTileGroup?.style("opacity", satellite ? 0.84 : 0.92);
    cloudGroup?.style("opacity", satellite ? 0.48 : 0.34);
    windFieldCanvas.style("opacity", satellite ? 0.68 : 0.88);
    temperatureFieldCanvas.style("opacity", satellite ? 0.72 : 0.93);

    if (hasRasterBasemap) renderBasemapTiles();
    if (mapMetric === "temperature") {
        forceNextTemperatureFieldRender = true;
        scheduleTemperatureFieldRender();
    }
    if (mapMetric === "wind") {
        forceNextWindFieldRender = true;
        scheduleWindFieldRender();
    }
}

function updateBasemapControls() {
    standardBasemapButton?.classList.toggle("active", baseMapMode === "standard");
    satelliteBasemapButton?.classList.toggle("active", baseMapMode === "satellite");

    if (satelliteBasemapButton) {
        satelliteBasemapButton.disabled = !satelliteBasemapAvailable;
        satelliteBasemapButton.title = satelliteBasemapAvailable
            ? "Use satellite imagery as the map background"
            : "Add MAPTILER_API_KEY to .env and restart the server";
    }
}

async function initializeSatelliteAvailability() {
    try {
        const response = await fetch("/api/basemap/status", {
            signal: AbortSignal.timeout(3000)
        });

        if (!response.ok) {
            throw new Error(`Basemap status failed: ${response.status}`);
        }

        const data = await response.json();
        terrainBasemapAvailable = Boolean(data?.terrain?.available);
        satelliteBasemapAvailable = Boolean(data?.satellite?.available);
    } catch (error) {
        console.warn("Basemap status unavailable:", error);
        terrainBasemapAvailable = false;
        satelliteBasemapAvailable = false;
    }

    if (!satelliteBasemapAvailable && baseMapMode === "satellite") {
        baseMapMode = "standard";
    }

    updateBasemapControls();
}

function setBaseMapMode(nextMode) {
    if (nextMode !== "standard" && nextMode !== "satellite") return;

    if (nextMode === "satellite" && !satelliteBasemapAvailable) {
        showMapError("Satellite view requires MAPTILER_API_KEY in the server environment");
        return;
    }

    baseMapMode = nextMode;
    satelliteTileGroup.selectAll("image").remove();
    updateBasemapControls();
    applyBasemapStyling();
    hideMapError();
    updateUrlState();
}

function cacheRainTilePixels(imageNode, tile) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(imageNode, 0, 0, 256, 256);
        rainTilePixelCache.set(tile.cacheKey ?? tile.key, context.getImageData(0, 0, 256, 256));
    } catch (error) {
        // Sampling is a progressive enhancement. The visible tile still works.
        console.debug("Rain tile sampling unavailable:", error);
    }
}

function rainTileSample(longitude, latitude) {
    longitude = wrapLongitude(longitude);
    const z = realtimeRainTileZoom();
    const count = 2 ** z;
    const clampedLat = clampMercatorLatitude(latitude);
    const xFloat = ((longitude + 180) / 360) * count;
    const latRad = clampedLat * Math.PI / 180;
    const yFloat = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * count;
    const x = Math.max(0, Math.min(count - 1, Math.floor(xFloat)));
    const y = Math.max(0, Math.min(count - 1, Math.floor(yFloat)));
    const imageData = rainTilePixelCache.get(`${z}:${x}:${y}`);

    if (!imageData) return null;

    const pixelX = Math.max(0, Math.min(255, Math.floor((xFloat - x) * 256)));
    const pixelY = Math.max(0, Math.min(255, Math.floor((yFloat - y) * 256)));
    const index = (pixelY * 256 + pixelX) * 4;

    return {
        r: imageData.data[index],
        g: imageData.data[index + 1],
        b: imageData.data[index + 2],
        a: imageData.data[index + 3]
    };
}

function rainTileIntensityLabel(longitude, latitude) {
    const sample = rainTileSample(longitude, latitude);
    if (!sample) return "Loading precipitation intensity…";

    // OpenWeather's precipitation tiles encode intensity mostly through
    // opacity and blue saturation. We intentionally show a range rather
    // than inventing a false point-precision value from a raster tile.
    const alpha = sample.a;
    if (alpha < 8) return "No mapped precipitation";
    if (alpha < 45) return "Light precipitation · ~0.5–1 mm";
    if (alpha < 145) return "Moderate precipitation · ~1–10 mm";
    if (alpha < 215) return "Heavy precipitation · ~10–50 mm";
    return "Very heavy precipitation · ~50–140+ mm";
}

function renderRealtimePrecipitationTiles() {
    if (
        !rainTileGroup ||
        mapMode !== "realtime" ||
        mapMetric !== "precipitation"
    ) {
        rainTileGroup?.style("display", "none");
        return;
    }

    rainTileGroup.style("display", null);

    const tiles = precipitationTilesForViewport();
    const images = rainTileGroup
        .selectAll("image.precipitation-tile")
        .data(tiles, (tile) => tile.key);

    images.join(
        (enter) => enter
            .append("image")
            .attr("class", "precipitation-tile")
            .attr("preserveAspectRatio", "none")
            .attr("opacity", 0)
            .attr("href", (tile) =>
                `/api/weather/map-tile/precipitation_new/${tile.z}/${tile.x}/${tile.y}`
            )
            .attr("x", (tile) => tile.screenX)
            .attr("y", (tile) => tile.screenY)
            .attr("width", (tile) => tile.width + 0.5)
            .attr("height", (tile) => tile.height + 0.5)
            .on("load.rain-sample", function (event, tile) {
                cacheRainTilePixels(this, tile);
            })
            .call((selection) => mapTransition(selection, MAP_FAST_TRANSITION_MS).attr("opacity", 0.82)),
        (update) => update
            .attr("href", (tile) =>
                `/api/weather/map-tile/precipitation_new/${tile.z}/${tile.x}/${tile.y}`
            )
            .attr("x", (tile) => tile.screenX)
            .attr("y", (tile) => tile.screenY)
            .attr("width", (tile) => tile.width + 0.5)
            .attr("height", (tile) => tile.height + 0.5)
            .on("load.rain-sample", function (event, tile) {
                cacheRainTilePixels(this, tile);
            })
            .attr("opacity", 0.82),
        (exit) => exit.remove()
    );

    rainTileGroup.lower();
}

function renderActiveMetricLayer(points) {
    temperatureGroup?.style("display", "none");

    if (mapMode === "realtime" && mapMetric === "precipitation") {
        temperatureFieldCanvas.style("display", "none");
        temperatureFieldContext.clearRect(0, 0, mapWidth, mapHeight);
        windFieldCanvas.style("display", "none");
        windFieldContext.clearRect(0, 0, mapWidth, mapHeight);
        rainTileGroup.style("display", null);
        renderRealtimePrecipitationTiles();
        return;
    }

    rainTileGroup?.style("display", "none");

    if (mapMetric === "wind") {
        temperatureFieldCanvas.style("display", "none");
        temperatureFieldContext.clearRect(0, 0, mapWidth, mapHeight);
        renderWindField(points);
        return;
    }

    windFieldCanvas.style("display", "none");
    windFieldContext.clearRect(0, 0, mapWidth, mapHeight);
    renderTemperatureField(points);
}

function setAtmosphereVisibility(visible) {
    if (!cloudGroup || !windGroup) {
        return;
    }

    const cloudVisible = visible && mapMetric === "temperature";
    const windVisible = mapMode === "realtime" && (visible || mapMetric === "wind");

    cloudGroup.style("display", null);
    windGroup.style("display", null);

    mapTransition(cloudGroup, MAP_FAST_TRANSITION_MS)
        .style("opacity", cloudVisible ? 1 : 0)
        .on("end", () => {
            if (!cloudVisible) cloudGroup.style("display", "none");
        });

    mapTransition(windGroup, MAP_FAST_TRANSITION_MS)
        .style("opacity", windVisible ? 1 : 0)
        .on("end", () => {
            if (!windVisible) windGroup.style("display", "none");
        });
}

function renderCloudLayer(points) {
    const cloudPoints = points.filter((point) =>
        Number.isFinite(point.cloudCover)
    );

    const cloudsVisible = mapMetric !== "wind";
    cloudGroup
        .style("display", cloudsVisible ? null : "none")
        .style("opacity", cloudsVisible ? 1 : 0);

    const clouds = cloudGroup
        .selectAll(".cloud-point")
        .data(cloudPoints, (point) => `${point.latitude}:${point.longitude}`);

    const joined = clouds.join(
        (enter) => enter
            .append("circle")
            .attr("class", "cloud-point")
            .attr("cx", (point) => projection([point.longitude, point.latitude])?.[0])
            .attr("cy", (point) => projection([point.longitude, point.latitude])?.[1])
            .attr("r", 0)
            .attr("fill", "#ffffff")
            .attr("filter", "url(#cloud-blur)")
            .attr("opacity", 0),
        (update) => update,
        (exit) => {
            mapTransition(exit, MAP_FAST_TRANSITION_MS)
                .attr("r", 0)
                .attr("opacity", 0)
                .remove();
            return exit;
        }
    );

    mapTransition(joined)
        .attr("cx", (point) => projection([point.longitude, point.latitude])?.[0])
        .attr("cy", (point) => projection([point.longitude, point.latitude])?.[1])
        .attr("r", (point) => 23 + point.cloudCover * 0.13)
        .attr("opacity", (point) => Math.min(0.38, 0.025 + point.cloudCover / 290));
}

function nearestMapPoint(longitude, latitude, points = currentMapPoints) {
    let nearest = null;
    let bestDistance = Infinity;

    for (const point of points) {
        const lonDifference = Math.abs(point.longitude - longitude);
        const wrappedLongitude = Math.min(
            lonDifference,
            360 - lonDifference
        );
        const latitudeDifference = point.latitude - latitude;
        const distance =
            wrappedLongitude * wrappedLongitude +
            latitudeDifference * latitudeDifference;

        if (distance < bestDistance) {
            bestDistance = distance;
            nearest = point;
        }
    }

    return nearest;
}

function pointWindVector(point) {
    const speed = Number(point?.windSpeed);
    const direction = Number(point?.windDirection);
    if (!Number.isFinite(speed) || !Number.isFinite(direction)) return null;

    const angle = (((direction + 180) % 360) * Math.PI) / 180;
    return {
        east: Math.sin(angle) * speed,
        north: Math.cos(angle) * speed
    };
}

function interpolatedWindSlow(longitude, latitude, windPoints) {
    const nearest = [];
    const longitudeScale = Math.max(0.15, Math.cos(latitude * Math.PI / 180));

    for (const point of windPoints) {
        let longitudeDifference = point.longitude - longitude;
        if (longitudeDifference > 180) longitudeDifference -= 360;
        else if (longitudeDifference < -180) longitudeDifference += 360;

        const latitudeDifference = point.latitude - latitude;
        const distanceSquared =
            Math.pow(longitudeDifference * longitudeScale, 2) +
            Math.pow(latitudeDifference, 2);
        const vector = pointWindVector(point);
        if (!vector) continue;

        const candidate = { ...vector, distanceSquared };
        if (distanceSquared < 0.000001) {
            return { east: candidate.east, north: candidate.north };
        }

        let inserted = false;
        for (let index = 0; index < nearest.length; index += 1) {
            if (distanceSquared < nearest[index].distanceSquared) {
                nearest.splice(index, 0, candidate);
                inserted = true;
                break;
            }
        }
        if (!inserted) nearest.push(candidate);
        if (nearest.length > 4) nearest.pop();
    }

    if (!nearest.length) return null;

    let east = 0;
    let north = 0;
    let totalWeight = 0;
    for (const item of nearest) {
        const weight = 1 / Math.max(item.distanceSquared, 0.01);
        east += item.east * weight;
        north += item.north * weight;
        totalWeight += weight;
    }

    return { east: east / totalWeight, north: north / totalWeight };
}

function interpolatedWind(longitude, latitude, windPoints) {
    const cell = regularGridCell(longitude, latitude, windPoints);
    if (cell) {
        const vectors = [cell.p00, cell.p10, cell.p01, cell.p11].map(pointWindVector);
        if (vectors.every(Boolean)) {
            return {
                east: bilinear(vectors[0].east, vectors[1].east, vectors[2].east, vectors[3].east, cell.x, cell.y),
                north: bilinear(vectors[0].north, vectors[1].north, vectors[2].north, vectors[3].north, cell.x, cell.y)
            };
        }
    }

    return interpolatedWindSlow(longitude, latitude, windPoints);
}

function vectorDirectionDegrees(east, north) {
    return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
}

function windArrowHtml(east, north) {
    const angle = vectorDirectionDegrees(east, north);
    return `<span class="wind-direction-arrow" style="transform:rotate(${angle.toFixed(1)}deg)" aria-hidden="true">↑</span>`;
}

function metricCursorValue(longitude, latitude, preferSelectedPoint = false) {
    const points =
        mapMode === "realtime" && mapMetric === "precipitation" && realtimePrecipitationPoints.length
            ? realtimePrecipitationPoints
            : currentMapPoints;

    if (!points?.length) return null;

    const exactWeather = preferSelectedPoint ? window.__climateCurrentWeather : null;
    const exactForecast = preferSelectedPoint ? window.__climateForecastPoint : null;

    if (mapMetric === "wind") {
        const exactSpeed = mapMode === "realtime"
            ? Number(exactWeather?.weather?.windSpeed)
            : Number(exactForecast?.windSpeed);

        // Seasonal forecast data contains monthly mean wind speed, but it does
        // not include a meaningful wind direction field. Realtime can render a
        // vector arrow; forecast should therefore use the scalar field instead
        // of requiring a direction that does not exist.
        if (mapMode === "forecast") {
            const speed = Number.isFinite(exactSpeed)
                ? exactSpeed
                : interpolatedScalar(
                    longitude,
                    latitude,
                    points,
                    (point) => point.windSpeed
                );
            if (!Number.isFinite(speed)) return null;

            const exactAnomaly = Number(exactForecast?.windSpeedAnomaly);
            const anomaly = Number.isFinite(exactAnomaly)
                ? exactAnomaly
                : interpolatedScalar(
                    longitude,
                    latitude,
                    points,
                    (point) => point.windSpeedAnomaly
                );

            return `${speed.toFixed(1)} m/s monthly mean${Number.isFinite(anomaly) ? ` · ${anomaly >= 0 ? "+" : ""}${anomaly.toFixed(1)} m/s anomaly` : ""}`;
        }

        const vector = interpolatedWind(longitude, latitude, points);
        if (!vector) return null;
        const speed = Number.isFinite(exactSpeed)
            ? exactSpeed
            : Math.hypot(vector.east, vector.north);
        if (!Number.isFinite(speed)) return null;
        return `${speed.toFixed(1)} m/s ${windArrowHtml(vector.east, vector.north)}`;
    }

    if (mapMetric === "precipitation") {
        if (mapMode === "forecast") {
            const value = interpolatedScalar(
                longitude,
                latitude,
                points,
                (point) => point.precipitationAnomaly
            );
            if (!Number.isFinite(value)) return null;

            const mean = interpolatedScalar(
                longitude,
                latitude,
                points,
                (point) => point.precipitation
            );
            const sign = value >= 0 ? "+" : "";
            return `${sign}${value.toFixed(1)} mm anomaly${Number.isFinite(mean) ? ` · ${mean.toFixed(1)} mm mean` : ""}`;
        }

        return rainTileIntensityLabel(longitude, latitude);
    }

    const exactTemperature = mapMode === "realtime"
        ? Number(exactWeather?.weather?.temperature)
        : Number(exactForecast?.temperature);
    const temperature = Number.isFinite(exactTemperature)
        ? exactTemperature
        : interpolatedScalar(
            longitude,
            latitude,
            points,
            (point) => point.temperature
        );
    if (!Number.isFinite(temperature)) return null;

    if (mapMode === "forecast") {
        const exactAnomaly = Number(exactForecast?.anomaly);
        const anomaly = Number.isFinite(exactAnomaly)
            ? exactAnomaly
            : interpolatedScalar(
                longitude,
                latitude,
                points,
                (point) => point.anomaly
            );
        return `${temperature.toFixed(1)} °C${Number.isFinite(anomaly) ? ` · ${anomaly >= 0 ? "+" : ""}${anomaly.toFixed(1)} °C anomaly` : ""}`;
    }

    return `${temperature.toFixed(1)} °C`;
}

function updateMetricCursorTooltip(event) {
    if (!projection || !currentMapPoints.length) {
        metricCursorTooltip.style("display", "none");
        return;
    }

    const mapElement = document.getElementById("map");
    const [screenX, screenY] = d3.pointer(event, mapSvg.node());
    const transform = d3.zoomTransform(mapSvg.node());
    const coordinates = projection.invert(transform.invert([screenX, screenY]));

    if (!coordinates) {
        metricCursorTooltip.style("display", "none");
        return;
    }

    const [rawLongitude, latitude] = coordinates;
    const longitude = wrapLongitude(rawLongitude);

    let preferSelectedPoint = false;
    if (selectedLocation) {
        const selectedProjected = projection([
            selectedLocation.longitude,
            selectedLocation.latitude
        ]);
        if (selectedProjected) {
            const selectedScreen = transform.apply(selectedProjected);
            const screenWorldWidth = mercatorWorldWidth() * transform.k;
            const wrappedSelectedX = selectedScreen[0] +
                Math.round((screenX - selectedScreen[0]) / screenWorldWidth) * screenWorldWidth;
            preferSelectedPoint = Math.hypot(
                screenX - wrappedSelectedX,
                screenY - selectedScreen[1]
            ) <= 22;
        }
    }

    const value = metricCursorValue(longitude, latitude, preferSelectedPoint);
    if (!value) {
        metricCursorTooltip.style("display", "none");
        return;
    }

    const [tooltipX, tooltipY] = d3.pointer(event, mapElement);
    metricCursorTooltip
        .style("display", "block")
        .style("left", `${tooltipX + 14}px`)
        .style("top", `${tooltipY + 14}px`)
        .html(`${hoveredCountryName ? `<span style="opacity:.78">${hoveredCountryName}</span><br>` : ""}<strong>${value}</strong>`);
}

function randomWindCoordinate() {
    const landOnly = false;

    for (let attempt = 0; attempt < 60; attempt += 1) {
        const longitude = -180 + Math.random() * 360;
        const latitude = -82 + Math.random() * 164;

        if (
            !landOnly ||
            !landFeature ||
            d3.geoContains(landFeature, [longitude, latitude])
        ) {
            return { longitude, latitude };
        }
    }

    return {
        longitude: -180 + Math.random() * 360,
        latitude: -80 + Math.random() * 160
    };
}

function resetParticle(particle) {
    const coordinate = randomWindCoordinate();

    particle.longitude = coordinate.longitude;
    particle.latitude = coordinate.latitude;
    particle.age = 0;
    particle.maxAge = 80 + Math.random() * 150;
}

function stopWindAnimation() {
    if (windAnimationFrame !== null) {
        cancelAnimationFrame(windAnimationFrame);
        windAnimationFrame = null;
    }

    windParticleCanvas.style("display", "none");
    windParticleContext.clearRect(0, 0, mapWidth, mapHeight);
    windGroup?.selectAll("line").remove();
}

function startWindAnimation(points) {
    stopWindAnimation();

    const windPoints = points.filter(
        (point) =>
            Number.isFinite(point.windSpeed) &&
            Number.isFinite(point.windDirection)
    );

    if (!windPoints.length || mapMode !== "realtime") {
        return;
    }

    windParticleCanvas.style("display", "block");
    windLastFrame = performance.now();

    // Keep the optimized O(1) wind interpolation, but restore a denser
    // visual field. The previous performance pass reduced the number of
    // particles too aggressively and made the flow look sparse.
    const particleCount = prefersReducedMotion
        ? 0
        : mapMetric === "wind"
            ? 1700
            : 700;

    windParticles = d3.range(particleCount).map(() => {
        const coordinate = randomWindCoordinate();
        return {
            ...coordinate,
            age: Math.random() * 100,
            maxAge: 105 + Math.random() * 155
        };
    });

    function resetCanvasParticle(particle) {
        const coordinate = randomWindCoordinate();
        particle.longitude = coordinate.longitude;
        particle.latitude = coordinate.latitude;
        particle.age = 0;
        particle.maxAge = 105 + Math.random() * 155;
    }

    function animateWind(timestamp) {
        if (mapMode !== "realtime") {
            stopWindAnimation();
            return;
        }

        const frameScale = Math.min(
            2.2,
            Math.max(0.4, (timestamp - windLastFrame) / 16.67)
        );
        windLastFrame = timestamp;

        const transform = d3.zoomTransform(mapSvg.node());
        const ctx = windParticleContext;

        // Fade the previous frame instead of clearing it completely. This
        // creates short stream trails similar to dedicated wind-map apps.
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = mapMetric === "wind"
            ? "rgba(0,0,0,0.935)"
            : "rgba(0,0,0,0.84)";
        ctx.fillRect(0, 0, mapWidth, mapHeight);
        ctx.restore();

        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.lineCap = "round";
        ctx.strokeStyle = mapMetric === "wind"
            ? "rgba(255,255,255,0.62)"
            : "rgba(255,255,255,0.38)";

        for (const particle of windParticles) {
            const previousGeo = [particle.longitude, particle.latitude];
            const previousProjected = projection(previousGeo);
            const wind = interpolatedWind(
                particle.longitude,
                particle.latitude,
                windPoints
            );

            if (!previousProjected || !wind) {
                resetCanvasParticle(particle);
                continue;
            }

            const rawSpeed = Math.hypot(wind.east, wind.north);
            const speed = Math.min(Math.max(rawSpeed, 0.6), 22);
            const speedScale = rawSpeed > 0 ? speed / rawSpeed : 0;
            const east = wind.east * speedScale;
            const north = wind.north * speedScale;
            const moveFactor = (mapMetric === "wind" ? 0.0053 : 0.0042) * frameScale;
            const latitudeRadians = particle.latitude * Math.PI / 180;
            const longitudeScale = Math.max(0.32, Math.cos(latitudeRadians));

            particle.latitude += north * moveFactor;
            particle.longitude += east * moveFactor / longitudeScale;

            if (particle.longitude > 180) particle.longitude -= 360;
            if (particle.longitude < -180) particle.longitude += 360;

            particle.age += frameScale;

            const leftAllowedArea = false;

            if (
                particle.age > particle.maxAge ||
                particle.latitude > 84.5 ||
                particle.latitude < -84.5 ||
                leftAllowedArea
            ) {
                resetCanvasParticle(particle);
                continue;
            }

            const nextProjected = projection([
                particle.longitude,
                particle.latitude
            ]);

            if (!nextProjected) {
                resetCanvasParticle(particle);
                continue;
            }

            const width = mercatorWorldWidth();
            let nextProjectedX = nextProjected[0];
            const rawProjectedDx = nextProjectedX - previousProjected[0];
            if (rawProjectedDx > width / 2) nextProjectedX -= width;
            if (rawProjectedDx < -width / 2) nextProjectedX += width;

            const life = particle.age / particle.maxAge;
            const fadeIn = Math.min(1, life / 0.10);
            const fadeOut = Math.min(1, (1 - life) / 0.16);
            const opacity = Math.max(0, Math.min(fadeIn, fadeOut));

            ctx.globalAlpha = opacity * (mapMetric === "wind" ? 0.95 : 0.65);
            ctx.lineWidth = mapMetric === "wind"
                ? 0.65 + Math.min(speed / 22, 0.65)
                : 0.7;

            for (const worldOffset of [-width, 0, width]) {
                const previous = transform.apply([
                    previousProjected[0] + worldOffset,
                    previousProjected[1]
                ]);
                const next = transform.apply([
                    nextProjectedX + worldOffset,
                    nextProjected[1]
                ]);
                const dx = next[0] - previous[0];
                const dy = next[1] - previous[1];
                const distance = Math.hypot(dx, dy);

                if (!Number.isFinite(distance) || distance < 0.05 || distance > 45) {
                    continue;
                }

                if (
                    Math.max(previous[0], next[0]) < -20 ||
                    Math.min(previous[0], next[0]) > mapWidth + 20 ||
                    Math.max(previous[1], next[1]) < -20 ||
                    Math.min(previous[1], next[1]) > mapHeight + 20
                ) {
                    continue;
                }

                ctx.beginPath();
                ctx.moveTo(previous[0], previous[1]);
                ctx.lineTo(next[0], next[1]);
                ctx.stroke();
            }
        }

        ctx.restore();
        windAnimationFrame = requestAnimationFrame(animateWind);
    }

    windAnimationFrame = requestAnimationFrame(animateWind);
}

function mergePrecipitationPoints(
    basePoints,
    detailPoints
) {
    const merged = new Map();

    for (const point of basePoints) {
        if (!Number.isFinite(point.precipitation)) {
            continue;
        }

        merged.set(
            `${point.latitude.toFixed(3)}:${point.longitude.toFixed(3)}`,
            point
        );
    }

    for (const point of detailPoints) {
        if (!Number.isFinite(point.precipitation)) {
            continue;
        }

        merged.set(
            `${point.latitude.toFixed(3)}:${point.longitude.toFixed(3)}`,
            {
                ...point,
                precipitationDetail: true
            }
        );
    }

    return [...merged.values()];
}

function currentMapCenterCoordinates() {
    if (!projection) {
        return null;
    }

    const transform =
        d3.zoomTransform(mapSvg.node());

    const mapPoint =
        transform.invert([
            mapWidth / 2,
            mapHeight / 2
        ]);

    const coordinates =
        projection.invert(mapPoint);

    if (!coordinates) {
        return null;
    }

    return {
        longitude: wrapLongitude(coordinates[0]),
        latitude: coordinates[1]
    };
}

async function loadRealtimePrecipitationDetail() {
    if (
        mapMode !== "realtime" ||
        mapMetric !== "precipitation" ||
        !projection
    ) {
        return;
    }

    const transform =
        d3.zoomTransform(mapSvg.node());

    const center =
        selectedLocation ??
        currentMapCenterCoordinates();

    if (
        !center ||
        !Number.isFinite(center.latitude) ||
        !Number.isFinite(center.longitude)
    ) {
        return;
    }

    const requestId =
        ++precipitationDetailRequestId;

    const params = new URLSearchParams({
        mode: "realtime",
        metric: "precipitation",
        lat: String(center.latitude),
        lon: String(center.longitude),
        zoom: String(transform.k)
    });

    try {
        const response = await fetch(
            `/api/temperature-map?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error(
                `Realtime precipitation detail failed: ${response.status}`
            );
        }

        const data = await response.json();

        if (
            requestId !== precipitationDetailRequestId ||
            mapMode !== "realtime" ||
            mapMetric !== "precipitation"
        ) {
            return;
        }

        realtimePrecipitationDetailPoints =
            data.points ?? [];

        realtimePrecipitationPoints =
            mergePrecipitationPoints(
                realtimeBasePoints,
                realtimePrecipitationDetailPoints
            );

        currentMapPoints =
            realtimePrecipitationPoints;

        renderActiveMetricLayer(
            currentMapPoints
        );

        hideMapError();
    } catch (error) {
        console.warn(
            "Realtime precipitation detail unavailable:",
            error
        );

        if (
            requestId === precipitationDetailRequestId
        ) {
            currentMapPoints =
                mergePrecipitationPoints(
                    realtimeBasePoints,
                    realtimePrecipitationDetailPoints
                );

            renderActiveMetricLayer(
                currentMapPoints
            );
        }
    }
}

async function loadRealtimePrecipitationMap() {
    realtimePrecipitationPoints =
        mergePrecipitationPoints(
            realtimeBasePoints,
            realtimePrecipitationDetailPoints
        );

    currentMapPoints =
        realtimePrecipitationPoints;

    renderActiveMetricLayer(
        currentMapPoints
    );

    hideMapError();
    hideLoading();

    void loadRealtimePrecipitationDetail();
}

async function loadRealtimeMap() {
    showLoading("Loading realtime weather…");

    const response = await fetch(
        "/api/temperature-map?mode=realtime"
    );

    if (!response.ok) {
        if (realtimeBasePoints.length) {
            setAtmosphereVisibility(mapMetric === "temperature");
            renderCloudLayer(realtimeBasePoints);
            startWindAnimation(realtimeBasePoints);

            currentMapPoints = realtimeBasePoints;
            renderActiveMetricLayer(currentMapPoints);

            updateMetricControls();
            if (mapMetric === "precipitation") {
                updateMapDataMeta("OpenWeather Weather Maps 1.0 precipitation tiles");
            } else {
                updateMapDataMeta(
                    "Cached Open-Meteo realtime grid · live refresh unavailable"
                );
            }
            showMapError(
                "Live weather refresh is temporarily unavailable — showing cached data"
            );
            hideLoading();
            return;
        }

        throw new Error(`Realtime map failed: ${response.status}`);
    }

    const data = await response.json();
    realtimeBasePoints = data.points ?? [];
    realtimePrecipitationPoints = [];
    realtimePrecipitationDetailPoints = [];

    setAtmosphereVisibility(mapMetric === "temperature");
    renderCloudLayer(realtimeBasePoints);
    startWindAnimation(realtimeBasePoints);

    currentMapPoints = realtimeBasePoints;
    renderActiveMetricLayer(currentMapPoints);

    updateMetricControls();
    if (mapMetric === "precipitation") {
        updateMapDataMeta("OpenWeather Weather Maps 1.0 precipitation tiles");
    } else {
        updateMapDataMeta("Open-Meteo realtime grid", data.cache);
    }
    hideMapError();
    hideLoading();
}

async function loadForecastMap() {
    forecastMonthSelect.disabled = true;

    showLoading(
        `Loading ${formatMonth(selectedForecastMonth)} forecast…`
    );

    stopWindAnimation();
    setAtmosphereVisibility(false);

    const response = await fetch(
        `/api/temperature-map?mode=forecast&month=${encodeURIComponent(selectedForecastMonth)}`
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            error.error || `Forecast map failed: ${response.status}`
        );
    }

    const data = await response.json();
    currentMapPoints = data.points ?? [];
    updateForecastPrecipitationScale(currentMapPoints);

    renderActiveMetricLayer(currentMapPoints);

    updateMetricControls();
    updateMapDataMeta("ECMWF SEAS5 monthly outlook", data.cache);
    hideMapError();
    hideLoading();

    forecastMonthSelect.disabled = false;
}

async function reloadMapData() {
    try {
        if (mapMode === "forecast") {
            await loadForecastMap();
        } else {
            await loadRealtimeMap();
        }
    } catch (error) {
        console.error(error);
        hideLoading();
        forecastMonthSelect.disabled = false;
        mapTooltip.style("display", "none");
        showMapError(error.message || "Failed to load map data");
    }
}

async function loadSelectedLocationDetails() {
    if (!selectedLocation) {
        return;
    }

    const { latitude, longitude } = selectedLocation;

    try {
        if (mapMode === "realtime") {
            const response = await fetch(
                `/api/weather/current?lat=${latitude}&lon=${longitude}`
            );

            if (!response.ok) {
                throw new Error(`Weather request failed: ${response.status}`);
            }

            const weather = await response.json();
            window.renderWeather?.(weather);

            selectedLocation = {
                ...selectedLocation,
                name: weather.location.name || selectedLocation.name,
                country: weather.location.country || selectedLocation.country
            };

            emitLocationSelection();
            updateUrlState();
            return;
        }

        const [weatherResponse, forecastResponse] = await Promise.all([
            fetch(`/api/weather/current?lat=${latitude}&lon=${longitude}`),
            fetch(
                `/api/forecast/seasonal?lat=${latitude}&lon=${longitude}&month=${encodeURIComponent(selectedForecastMonth)}`
            )
        ]);

        if (!weatherResponse.ok || !forecastResponse.ok) {
            throw new Error("Failed to load selected forecast");
        }

        const [weather, forecast] = await Promise.all([
            weatherResponse.json(),
            forecastResponse.json()
        ]);

        window.renderForecast?.(weather, forecast);

        selectedLocation = {
            ...selectedLocation,
            name: weather.location.name || selectedLocation.name,
            country: weather.location.country || selectedLocation.country
        };

        emitLocationSelection();
        updateUrlState();
    } catch (error) {
        console.error(error);
    }
}

function updateModeControls() {
    const isForecast = mapMode === "forecast";

    realtimeButton.classList.toggle("active", !isForecast);
    forecastButton.classList.toggle("active", isForecast);
    forecastMonthSelect.hidden = !isForecast;
    updateMetricControls();
}

async function setMapMode(nextMode) {
    if (nextMode !== "realtime" && nextMode !== "forecast") {
        return;
    }

    mapMode = nextMode;
    clearComparison();
    updateModeControls();
    updateUrlState();

    await reloadMapData();

    if (selectedLocation) {
        await loadSelectedLocationDetails();
    }
}

function updateCityVisibility(scale = 1) {
    if (!cityGroup || !projection) {
        return;
    }

    const transform = d3.zoomTransform(mapSvg.node());
    const cityPlaces = cityGroup.selectAll(".city-place");
    const cities = cityPlaces.data();

    const maxLabels =
        scale < 1.5
            ? 34
            : scale < 2.6
                ? 62
                : scale < 4.5
                    ? 110
                    : 180;

    const candidates = cities
        .filter((city) => {
            const properties = city.properties ?? {};
            const scaleRank = Number(properties.scalerank ?? 99);
            const isCapital = Number(properties.adm0cap ?? 0) === 1;
            const population = Number(properties.pop_max ?? 0);

            if (scale < 1.5) {
                return scaleRank <= 1 || (isCapital && population >= 900000);
            }

            if (scale < 2.6) {
                return isCapital || scaleRank <= 3;
            }

            if (scale < 4.5) {
                return isCapital || scaleRank <= 6;
            }

            return isCapital || scaleRank <= 10;
        })
        .sort((a, b) => {
            const aProperties = a.properties ?? {};
            const bProperties = b.properties ?? {};
            const aCapital = Number(aProperties.adm0cap ?? 0);
            const bCapital = Number(bProperties.adm0cap ?? 0);

            if (aCapital !== bCapital) {
                return bCapital - aCapital;
            }

            const rankDifference =
                Number(aProperties.scalerank ?? 99) -
                Number(bProperties.scalerank ?? 99);

            if (rankDifference !== 0) {
                return rankDifference;
            }

            return Number(bProperties.pop_max ?? 0) - Number(aProperties.pop_max ?? 0);
        });

    const occupied = [];
    const visibleCities = new Set();

    for (const city of candidates) {
        if (visibleCities.size >= maxLabels) {
            break;
        }

        const projected = projection(city.geometry.coordinates);
        if (!projected) {
            continue;
        }

        let [screenX, screenY] = transform.apply(projected);
        const screenWorldWidth = mercatorWorldWidth() * transform.k;
        screenX += Math.round((mapWidth / 2 - screenX) / screenWorldWidth) * screenWorldWidth;
        const name = String(city.properties?.name ?? "");
        const labelWidth = Math.max(20, name.length * 4.7 + 8);
        const labelHeight = 11;
        const box = {
            left: screenX + 4,
            right: screenX + 4 + labelWidth,
            top: screenY - labelHeight,
            bottom: screenY + 3
        };

        if (
            box.right < 0 ||
            box.left > mapWidth ||
            box.bottom < 0 ||
            box.top > mapHeight
        ) {
            continue;
        }

        const overlaps = occupied.some((existing) => !(
            box.right + 3 < existing.left ||
            box.left - 3 > existing.right ||
            box.bottom + 2 < existing.top ||
            box.top - 2 > existing.bottom
        ));

        if (overlaps) {
            continue;
        }

        occupied.push(box);
        visibleCities.add(city);
    }

    cityPlaces.style("display", (city) =>
        visibleCities.has(city) ? null : "none"
    );

    cityGroup
        .selectAll(".city-dot")
        .attr("r", 2.2 / scale)
        .attr("stroke-width", 0.65 / scale);

    cityGroup
        .selectAll(".city-label")
        .attr("font-size", `${8 / scale}px`)
        .attr("dx", 4.3 / scale)
        .attr("dy", -2.7 / scale)
        .attr("stroke-width", 2.1 / scale);
}

async function loadCities() {
    try {
        const cityData = await d3.json(CITY_DATA_URL);
        const cityFeatures = cityData.features ?? [];

        cityGroup = mapGroup
            .append("g")
            .attr("class", "cities-layer");

        const cityPlaces = cityGroup
            .selectAll(".city-place")
            .data(cityFeatures)
            .join("g")
            .attr("class", "city-place")
            .attr("transform", (city) => {
                const projected = projection(city.geometry.coordinates);
                return projected
                    ? `translate(${projected[0]}, ${projected[1]})`
                    : null;
            })
            .style("cursor", "pointer")
            .on("mouseenter", function () {
                const place = d3.select(this);
                place.select(".city-dot")
                    .interrupt("city-hover")
                    .transition("city-hover")
                    .duration(MAP_FAST_TRANSITION_MS)
                    .attr("r", 3.4 / d3.zoomTransform(mapSvg.node()).k)
                    .attr("fill", "#111111");
                place.select(".city-label")
                    .interrupt("city-hover")
                    .transition("city-hover")
                    .duration(MAP_FAST_TRANSITION_MS)
                    .attr("font-weight", 700)
                    .attr("opacity", 1);
            })
            .on("mouseleave", function () {
                const scale = d3.zoomTransform(mapSvg.node()).k;
                const place = d3.select(this);
                place.select(".city-dot")
                    .interrupt("city-hover")
                    .transition("city-hover")
                    .duration(MAP_FAST_TRANSITION_MS)
                    .attr("r", 2.2 / scale)
                    .attr("fill", "#222222");
                place.select(".city-label")
                    .interrupt("city-hover")
                    .transition("city-hover")
                    .duration(MAP_FAST_TRANSITION_MS)
                    .attr("font-weight", 400);
            })
            .on("click", (event, city) => {
                event.stopPropagation();

                const [longitude, latitude] =
                    city.geometry.coordinates;
                const properties = city.properties ?? {};

                selectLocation(
                    {
                        name: properties.name,
                        country: properties.iso_a2,
                        latitude,
                        longitude
                    },
                    { focus: true }
                );
            });

        cityPlaces
            .append("circle")
            .attr("class", "city-dot")
            .attr("r", 2.2)
            .attr("fill", "#222222")
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 0.65)
            .attr("vector-effect", "non-scaling-stroke");

        cityPlaces
            .append("text")
            .attr("class", "city-label")
            .attr("dx", 4.3)
            .attr("dy", -2.7)
            .attr("font-size", "8px")
            .attr("stroke-width", 2.1)
            .text((city) => city.properties?.name ?? "");

        updateCityVisibility(
            d3.zoomTransform(mapSvg.node()).k
        );

        selectionMarker.raise();
    } catch (error) {
        console.warn("City layer could not be loaded:", error);
    }
}

function animateMarker(marker, projected) {
    const wasHidden = marker.style("display") === "none";
    const currentX = Number(marker.attr("cx"));
    const currentY = Number(marker.attr("cy"));

    marker
        .interrupt("marker")
        .style("display", null)
        .raise();

    if (wasHidden || !Number.isFinite(currentX) || !Number.isFinite(currentY)) {
        marker
            .attr("cx", projected[0])
            .attr("cy", projected[1])
            .attr("r", 0)
            .attr("opacity", 0);
    }

    marker
        .transition("marker")
        .duration(prefersReducedMotion ? 0 : 520)
        .ease(d3.easeBackOut.overshoot(1.35))
        .attr("cx", projected[0])
        .attr("cy", projected[1])
        .attr("r", 6.2)
        .attr("opacity", 1)
        .transition("marker")
        .duration(prefersReducedMotion ? 0 : 170)
        .ease(d3.easeCubicOut)
        .attr("r", 5);
}

function setMarker(latitude, longitude) {
    const projected = projection([longitude, latitude]);

    if (!projected) {
        return;
    }

    animateMarker(selectionMarker, projected);
}

function setComparisonMarker(latitude, longitude) {
    const projected = projection([longitude, latitude]);

    if (!projected) {
        return;
    }

    animateMarker(comparisonMarker, projected);
}

function clearComparison() {
    const hadComparison = compareModeActive || compareBaseLocation || comparisonMarker.style("display") !== "none";
    compareModeActive = false;
    compareBaseLocation = null;
    comparisonMarker
        .interrupt("marker")
        .transition("marker")
        .duration(MAP_FAST_TRANSITION_MS)
        .attr("r", 0)
        .attr("opacity", 0)
        .on("end", () => comparisonMarker.style("display", "none"));
    compareMapButton.classList.remove("active");
    compareMapButton.textContent = "Compare";

    if (hadComparison) {
        hideMapError();
    }

    window.dispatchEvent(new CustomEvent("climate:comparison-cleared"));
}

window.clearMapComparison = clearComparison;

function emitLocationSelection() {
    if (!selectedLocation) {
        return;
    }

    window.dispatchEvent(new CustomEvent("climate:location-selected", {
        detail: {
            location: { ...selectedLocation },
            mode: mapMode,
            metric: mapMetric,
            month: selectedForecastMonth
        }
    }));
}

function updateUrlState() {
    const params = new URLSearchParams();
    params.set("mode", mapMode);
    params.set("metric", mapMetric);
    if (baseMapMode === "satellite") {
        params.set("base", "satellite");
    }

    if (mapMode === "forecast" && selectedForecastMonth) {
        params.set("month", selectedForecastMonth);
    }

    if (selectedLocation) {
        params.set("lat", selectedLocation.latitude.toFixed(4));
        params.set("lon", selectedLocation.longitude.toFixed(4));
    }

    const query = params.toString();
    history.replaceState(null, "", query ? `${location.pathname}?${query}` : location.pathname);
}

function applyInitialUrlState() {
    const params = new URLSearchParams(location.search);
    const mode = params.get("mode");
    const metric = params.get("metric");
    const month = params.get("month");
    const base = params.get("base");
    const latitude = Number(params.get("lat"));
    const longitude = Number(params.get("lon"));

    if (mode === "forecast" || mode === "realtime") {
        mapMode = mode;
    }

    if (["temperature", "precipitation", "wind"].includes(metric)) {
        mapMetric = metric;
    }

    if (base === "satellite" && satelliteBasemapAvailable) {
        baseMapMode = "satellite";
    }

    if (month && [...forecastMonthSelect.options].some((option) => option.value === month)) {
        forecastMonthSelect.value = month;
        selectedForecastMonth = month;
    }

    if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
    ) {
        initialUrlLocation = { latitude, longitude };
    }
}

window.getClimateMapContext = () => ({
    locationName: selectedLocation?.name ?? null,
    country: selectedLocation?.country ?? null,
    latitude: selectedLocation?.latitude ?? null,
    longitude: selectedLocation?.longitude ?? null,
    mapMode,
    mapMetric,
    baseMapMode,
    selectedMonth: selectedForecastMonth
});

function focusMapOnLocation(latitude, longitude) {
    if (!projection) {
        return;
    }

    const projected = projection([longitude, latitude]);

    if (!projected) {
        return;
    }

    const [x, y] = projected;
    const scale = 4;

    const transform = d3.zoomIdentity
        .translate(mapWidth / 2, mapHeight / 2)
        .scale(scale)
        .translate(-x, -y);

    mapSvg
        .transition()
        .duration(650)
        .ease(d3.easeCubicInOut)
        .call(zoom.transform, transform);
}

async function selectLocation(location, options = {}) {
    if (!projection) {
        return;
    }

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
    }

    const normalizedLocation = {
        ...location,
        latitude,
        longitude
    };

    if (compareModeActive && compareBaseLocation) {
        const samePoint =
            Math.abs(compareBaseLocation.latitude - latitude) < 0.01 &&
            Math.abs(compareBaseLocation.longitude - longitude) < 0.01;

        if (samePoint) {
            showMapError("Choose a different second location for comparison.");
            return;
        }

        setComparisonMarker(latitude, longitude);
        hideMapError();
        compareModeActive = false;
        compareMapButton.classList.remove("active");
        compareMapButton.textContent = "Compare";

        window.dispatchEvent(new CustomEvent("climate:compare-request", {
            detail: {
                first: { ...compareBaseLocation },
                second: normalizedLocation,
                mode: mapMode,
                month: selectedForecastMonth
            }
        }));

        compareBaseLocation = null;

        if (options.focus) {
            focusMapOnLocation(latitude, longitude);
        }

        return;
    }

    selectedLocation = normalizedLocation;

    setMarker(latitude, longitude);
    updateUrlState();
    emitLocationSelection();

    if (options.focus) {
        focusMapOnLocation(latitude, longitude);
    }

    await loadSelectedLocationDetails();


}

window.focusMapOnLocation = focusMapOnLocation;
window.selectMapLocation = selectLocation;
window.getMapMode = () => mapMode;

mapSvg.on("click", async (event) => {
    if (!projection) {
        return;
    }

    const [x, y] = d3.pointer(event);
    const transform = d3.zoomTransform(mapSvg.node());
    const mapPoint = transform.invert([x, y]);
    const coordinates = projection.invert(mapPoint);

    if (!coordinates) {
        return;
    }

    const [rawLongitude, latitude] = coordinates;
    const longitude = wrapLongitude(rawLongitude);

    if (
        landFeature &&
        !d3.geoContains(landFeature, [longitude, latitude])
    ) {
        return;
    }

    await selectLocation({
        latitude,
        longitude
    });
});

function mapMetricLabel() {
    if (mapMetric === "precipitation") {
        return mapMode === "forecast"
            ? "Monthly precipitation anomaly"
            : "Current precipitation";
    }

    if (mapMetric === "wind") {
        return mapMode === "forecast" ? "Monthly mean wind" : "Current wind speed";
    }

    return mapMode === "forecast" ? "Forecast monthly mean" : "Current temperature";
}

function mapMetricTooltip(point) {
    if (!point) {
        return "Data unavailable";
    }

    if (mapMetric === "precipitation") {
        if (mapMode === "forecast") {
            if (!Number.isFinite(point.precipitationAnomaly)) {
                return "Precipitation anomaly unavailable";
            }

            const sign = point.precipitationAnomaly >= 0 ? "+" : "";
            const mean = Number.isFinite(point.precipitation)
                ? `<br><span>Monthly mean: ${point.precipitation.toFixed(1)} mm</span>`
                : "";

            return `${sign}${point.precipitationAnomaly.toFixed(1)} mm anomaly${mean}`;
        }

        return "OpenWeather current precipitation layer";
    }

    if (mapMetric === "wind") {
        if (!Number.isFinite(point.windSpeed)) {
            return "Wind unavailable";
        }

        const anomaly = mapMode === "forecast" && Number.isFinite(point.windSpeedAnomaly)
            ? `<br><span>${point.windSpeedAnomaly >= 0 ? "+" : ""}${point.windSpeedAnomaly.toFixed(1)} m/s anomaly</span>`
            : "";

        return `${point.windSpeed.toFixed(1)} m/s${anomaly}`;
    }

    if (!Number.isFinite(point.temperature)) {
        return "Temperature unavailable";
    }

    const anomaly = mapMode === "forecast" && Number.isFinite(point.anomaly)
        ? `<br><span>${point.anomaly >= 0 ? "+" : ""}${point.anomaly.toFixed(1)} °C anomaly</span>`
        : "";

    return `${point.temperature.toFixed(1)} °C${anomaly}`;
}

function setupCountryHover(countryPaths) {
    countryPaths
        .on("mouseenter", function (event, country) {
            const [cx, cy] = path.centroid(country);
            hoveredCountryName = country.properties.name;

            countryBordersGroup
                .selectAll("path")
                .filter((borderCountry) =>
                    borderCountry?.properties?.name ===
                    country?.properties?.name
                )
                .interrupt("border-hover")
                .style("opacity", 0);

            hoverCountry
                .interrupt()
                .datum(country)
                .attr("d", path)
                .style("opacity", 1)
                .attr("transform", null)
                .transition()
                .duration(170)
                .ease(d3.easeCubicOut)
                .attr(
                    "transform",
                    `translate(${cx}, ${cy}) scale(1.022) translate(${-cx}, ${-cy})`
                );

            selectionMarker.raise();

            // The continuous metric cursor tooltip is the single source of
            // hover values. Keeping the old country tooltip here produced two
            // overlapping numeric labels.
            mapTooltip
                .interrupt("tooltip")
                .style("display", "none")
                .style("opacity", 0);
        })
        .on("mousemove", function (event, country) {
            hoveredCountryName = country.properties.name;
        })
        .on("mouseleave", function (event, country) {
            clearTimeout(hoverWeatherTimer);
            hoverRequestId += 1;
            hoveredCountryName = null;

            countryBordersGroup
                .selectAll("path")
                .filter((borderCountry) =>
                    borderCountry?.properties?.name ===
                    country?.properties?.name
                )
                .interrupt("border-hover")
                .transition("border-hover")
                .duration(140)
                .style("opacity", 1);

            hoverCountry
                .interrupt()
                .transition()
                .duration(130)
                .ease(d3.easeCubicIn)
                .attr("transform", null)
                .style("opacity", 0);
        });
}

async function initializeMap() {
    populateForecastMonths();
    await initializeSatelliteAvailability();
    applyInitialUrlState();
    updateModeControls();
    updateBasemapControls();

    const world = await d3.json(
        "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
    );

    countries = topojson.feature(
        world,
        world.objects.countries
    ).features;

    landFeature = topojson.feature(
        world,
        world.objects.land
    );

    // Use Web Mercator so OpenWeather raster weather tiles align exactly
    // with the D3 vector geography. The initial view prioritizes the
    // inhabited latitudes used in the dashboard rather than the poles.
    projection = d3
        .geoMercator()
        .scale(145)
        .translate([mapWidth / 2, mapHeight / 2 + 28])
        .center([0, 12]);

    projectedWorldWidth = 2 * Math.PI * projection.scale();
    path = d3.geoPath(projection);
    updateWorldCopies();

    const defs = mapSvg.append("defs");

    defs
        .append("filter")
        .attr("id", "temperature-blur")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%")
        .append("feGaussianBlur")
        .attr("stdDeviation", 19);

    defs
        .append("filter")
        .attr("id", "precipitation-blur")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%")
        .append("feGaussianBlur")
        .attr("stdDeviation", 4.5);

    defs
        .append("filter")
        .attr("id", "cloud-blur")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%")
        .append("feGaussianBlur")
        .attr("stdDeviation", 15);

    defs
        .append("clipPath")
        .attr("id", "land-clip")
        .append("path")
        .datum(landFeature)
        .attr("d", path);

    rainTileGroup = mapGroup
        .append("g")
        .attr("class", "realtime-rain-tiles")
        .style("display", "none")
        .style("pointer-events", "none");

    temperatureGroup = mapGroup
        .append("g")
        .attr("clip-path", "url(#land-clip)")
        .style("pointer-events", "none");

    cloudGroup = mapGroup
        .append("g")
        .attr("clip-path", "url(#land-clip)")
        .style("pointer-events", "none");

    windGroup = mapGroup
        .append("g")
        .attr("class", "wind-streamlines")
        .style("pointer-events", "none");

    countryBordersGroup = mapGroup
        .append("g")
        .attr("class", "country-borders");

    countryBordersGroup
        .selectAll("path")
        .data(countries)
        .join("path")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "#5f5f5f")
        .attr("stroke-width", 0.5)
        .attr("vector-effect", "non-scaling-stroke")
        .style("pointer-events", "none");

    countryInteractionGroup = mapGroup
        .append("g")
        .attr("class", "country-interactions");

    const countryPaths = countryInteractionGroup
        .selectAll("path")
        .data(countries)
        .join("path")
        .attr("d", path)
        .attr("fill", "transparent")
        .attr("stroke", "none")
        .style("cursor", "crosshair");

    hoverCountry = mapGroup
        .append("path")
        .attr("fill", "rgba(255, 255, 255, 0.1)")
        .attr("stroke", "#191919")
        .attr("stroke-width", 1.35)
        .attr("vector-effect", "non-scaling-stroke")
        .style("pointer-events", "none")
        .style("opacity", 0);

    setupCountryHover(countryPaths);
    applyBasemapStyling();

    await Promise.all([
        reloadMapData(),
        loadCities()
    ]);

    selectionMarker.raise();
    comparisonMarker.raise();

    if (initialUrlLocation) {
        await selectLocation(initialUrlLocation, { focus: true });
    } else {
        updateUrlState();
    }
}

realtimeButton.addEventListener("click", () => {
    setMapMode("realtime");
});

forecastButton.addEventListener("click", () => {
    setMapMode("forecast");
});

forecastMonthSelect.addEventListener("change", () => {
    selectedForecastMonth = forecastMonthSelect.value;
    clearComparison();
    updateMetricControls();
    updateUrlState();

    if (mapMode !== "forecast") {
        return;
    }

    clearTimeout(forecastChangeTimer);

    forecastChangeTimer = setTimeout(async () => {
        await reloadMapData();

        if (selectedLocation) {
            await loadSelectedLocationDetails();
        }
    }, 500);
});

async function setMapMetric(metric) {
    if (!["temperature", "precipitation", "wind"].includes(metric)) {
        return;
    }

    mapMetric = metric;
    updateMetricControls();

    try {
        if (mapMode === "realtime") {
            currentMapPoints = realtimeBasePoints;
            renderActiveMetricLayer(currentMapPoints);

            setAtmosphereVisibility(metric === "temperature");
            startWindAnimation(realtimeBasePoints);

            if (metric === "precipitation") {
                updateMapDataMeta("OpenWeather Weather Maps 1.0 precipitation tiles");
            } else {
                updateMapDataMeta("Open-Meteo realtime grid");
            }
        } else {
            renderActiveMetricLayer(currentMapPoints);
            setAtmosphereVisibility(false);
        }

        hideMapError();
    } catch (error) {
        console.error(error);
        hideLoading();
        showMapError(error.message || "Failed to load map data");
    }

    updateUrlState();
    emitLocationSelection();
}

temperatureMetricButton.addEventListener("click", () => {
    void setMapMetric("temperature");
});
precipitationMetricButton.addEventListener("click", () => {
    void setMapMetric("precipitation");
});
windMetricButton.addEventListener("click", () => {
    void setMapMetric("wind");
});

standardBasemapButton?.addEventListener("click", () => {
    setBaseMapMode("standard");
});

satelliteBasemapButton?.addEventListener("click", () => {
    setBaseMapMode("satellite");
});

compareMapButton.addEventListener("click", () => {
    hideMapError();

    if (compareModeActive) {
        clearComparison();
        return;
    }

    if (!selectedLocation) {
        showMapError("Select the first location before starting comparison.");
        return;
    }

    compareBaseLocation = { ...selectedLocation };
    compareModeActive = true;
    comparisonMarker.style("display", "none");
    compareMapButton.classList.add("active");
    compareMapButton.textContent = "Pick second";
    showMapError("Comparison mode: choose a second city or click another point on the map.");
});

resetMapButton.addEventListener("click", () => {
    hideMapError();
    mapSvg
        .transition()
        .duration(550)
        .ease(d3.easeCubicInOut)
        .call(
            zoom.transform,
            d3.zoomIdentity
        );
});

initializeMap().catch((error) => {
    console.error("Failed to initialize map:", error);
    hideLoading();
});
