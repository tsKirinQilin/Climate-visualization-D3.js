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
    .style("position", "absolute")
    .style("display", "none")
    .style("pointer-events", "none")
    .style("z-index", "40")
    .style("background", "rgba(20, 20, 20, 0.9)")
    .style("color", "white")
    .style("padding", "7px 9px")
    .style("border-radius", "3px")
    .style("font-size", "12px");

const mapSvg = mapRoot
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("width", "100%")
    .attr("aria-label", "Interactive global weather map");

const mapGroup = mapSvg.append("g");

const temperatureColor = d3
    .scaleSequential()
    .domain([-30, 40])
    .interpolator((t) => d3.interpolateRdYlBu(1 - t))
    .clamp(true);

const precipitationColor = d3
    .scaleSequential()
    .domain([0, 10])
    .interpolator(d3.interpolateBlues)
    .clamp(true);

function realtimePrecipitationColor(value) {
    if (!Number.isFinite(value) || value <= 0.01) {
        return "transparent";
    }

    const normalized = Math.min(1, Math.sqrt(value / 5));
    return d3.interpolateBlues(0.18 + normalized * 0.82);
}

const windColor = d3
    .scaleSequential()
    .domain([0, 18])
    .interpolator(d3.interpolateYlGnBu)
    .clamp(true);

let temperatureGroup;
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

const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
        mapGroup.attr("transform", event.transform);
        updateCityVisibility(event.transform.k);
    })
    .on("end", () => {
        if (
            mapMode !== "realtime" ||
            mapMetric !== "precipitation"
        ) {
            return;
        }

        clearTimeout(precipitationDetailTimer);

        precipitationDetailTimer =
            setTimeout(() => {
                void loadRealtimePrecipitationDetail();
            }, 300);
    });

mapSvg.call(zoom);

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

function metricValue(point) {
    if (mapMetric === "precipitation") {
        return point.precipitation;
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
            : precipitationColor(value);
    }

    if (mapMetric === "wind") {
        return windColor(value);
    }

    return temperatureColor(value);
}

function updateMetricControls() {
    temperatureMetricButton.classList.toggle("active", mapMetric === "temperature");
    precipitationMetricButton.classList.toggle("active", mapMetric === "precipitation");
    windMetricButton.classList.toggle("active", mapMetric === "wind");

    if (mapMetric === "precipitation") {
        legendBar.style.background = "linear-gradient(to right, #f7fbff, #c6dbef, #6baed6, #2171b5, #08306b)";
        legendLabels.innerHTML = mapMode === "forecast"
            ? "<span>0</span><span>2</span><span>4</span><span>7</span><span>10+ mm</span>"
            : "<span>0</span><span>0.5</span><span>1</span><span>2</span><span>5+ mm</span>";
        legendTitle.textContent = mapMode === "forecast"
            ? `${formatMonth(selectedForecastMonth)} precipitation mean`
            : "Current precipitation";
        return;
    }

    if (mapMetric === "wind") {
        legendBar.style.background = "linear-gradient(to right, #ffffd9, #c7e9b4, #7fcdbb, #2c7fb8, #253494)";
        legendLabels.innerHTML = "<span>0</span><span>4</span><span>8</span><span>12</span><span>18+ m/s</span>";
        legendTitle.textContent = mapMode === "forecast"
            ? `${formatMonth(selectedForecastMonth)} mean wind`
            : "Current wind speed";
        return;
    }

    legendBar.style.background = "linear-gradient(to right, #4575b4, #91bfdb, #ffffbf, #fdae61, #d73027)";
    legendLabels.innerHTML = "<span>-30°</span><span>-10°</span><span>0°</span><span>20°</span><span>40°C</span>";
    legendTitle.textContent = mapMode === "forecast"
        ? `${formatMonth(selectedForecastMonth)} forecast mean`
        : "Current temperature";
}

function renderTemperatureLayer(points) {
    const circles = temperatureGroup
        .selectAll(".temperature-point")
        .data(
            points,
            (point) => `${point.latitude}:${point.longitude}`
        );

    circles
        .join(
            (enter) => enter
                .append("circle")
                .attr("class", "temperature-point")
                .attr("opacity", 0),
            (update) => update,
            (exit) => exit.remove()
        )
        .attr("cx", (point) => {
            const projected = projection([
                point.longitude,
                point.latitude
            ]);
            return projected?.[0];
        })
        .attr("cy", (point) => {
            const projected = projection([
                point.longitude,
                point.latitude
            ]);
            return projected?.[1];
        })
        .attr("r", (point) =>
            mapMode === "realtime" &&
            mapMetric === "precipitation"
                ? point.precipitationDetail
                    ? 12
                    : 22
                : 39
        )
        .attr("filter",
            mapMode === "realtime" && mapMetric === "precipitation"
                ? "url(#precipitation-blur)"
                : "url(#temperature-blur)"
        )
        .attr("fill", (point) =>
            metricColor(point)
        )
        .transition()
        .duration(500)
        .attr("opacity", 0.82);
}

function renderCloudLayer(points) {
    const cloudPoints = points.filter((point) =>
        Number.isFinite(point.cloudCover)
    );

    cloudGroup
        .style("display", null)
        .selectAll(".cloud-point")
        .data(
            cloudPoints,
            (point) => `${point.latitude}:${point.longitude}`
        )
        .join("circle")
        .attr("class", "cloud-point")
        .attr("cx", (point) => {
            const projected = projection([
                point.longitude,
                point.latitude
            ]);
            return projected?.[0];
        })
        .attr("cy", (point) => {
            const projected = projection([
                point.longitude,
                point.latitude
            ]);
            return projected?.[1];
        })
        .attr("r", (point) => 23 + point.cloudCover * 0.13)
        .attr("fill", "#ffffff")
        .attr("filter", "url(#cloud-blur)")
        .attr("opacity", (point) =>
            Math.min(0.38, 0.025 + point.cloudCover / 290)
        );
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

function interpolatedWind(longitude, latitude, windPoints) {
    const nearestPoints = windPoints
        .map((point) => {
            let longitudeDifference =
                point.longitude - longitude;

            if (longitudeDifference > 180) {
                longitudeDifference -= 360;
            } else if (longitudeDifference < -180) {
                longitudeDifference += 360;
            }

            const latitudeDifference =
                point.latitude - latitude;

            const longitudeScale = Math.cos(
                latitude * Math.PI / 180
            );

            const distanceSquared =
                Math.pow(
                    longitudeDifference * longitudeScale,
                    2
                ) +
                Math.pow(latitudeDifference, 2);

            return {
                point,
                distanceSquared
            };
        })
        .sort(
            (a, b) =>
                a.distanceSquared -
                b.distanceSquared
        )
        .slice(0, 4);

    if (!nearestPoints.length) {
        return null;
    }

    let east = 0;
    let north = 0;
    let totalWeight = 0;

    for (const item of nearestPoints) {
        const point = item.point;

        if (item.distanceSquared < 0.000001) {
            const angle =
                (
                    (point.windDirection + 180) %
                    360
                ) *
                Math.PI /
                180;

            return {
                east:
                    Math.sin(angle) *
                    point.windSpeed,

                north:
                    Math.cos(angle) *
                    point.windSpeed
            };
        }

        const weight =
            1 / item.distanceSquared;

        const angle =
            (
                (point.windDirection + 180) %
                360
            ) *
            Math.PI /
            180;

        east +=
            Math.sin(angle) *
            point.windSpeed *
            weight;

        north +=
            Math.cos(angle) *
            point.windSpeed *
            weight;

        totalWeight += weight;
    }

    return {
        east: east / totalWeight,
        north: north / totalWeight
    };
}

function randomLandCoordinate() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        const longitude = -180 + Math.random() * 360;
        const latitude = -58 + Math.random() * 132;

        if (
            !landFeature ||
            d3.geoContains(landFeature, [longitude, latitude])
        ) {
            return { longitude, latitude };
        }
    }

    return {
        longitude: -180 + Math.random() * 360,
        latitude: -55 + Math.random() * 120
    };
}

function resetParticle(particle) {
    const coordinate = randomLandCoordinate();

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
}

function startWindAnimation(points) {
    stopWindAnimation();

    const windPoints = points.filter(
        (point) =>
            Number.isFinite(point.windSpeed) &&
            Number.isFinite(point.windDirection)
    );

    if (!windPoints.length) {
        windGroup.style("display", "none");
        return;
    }

    windGroup.style("display", null);

    windParticles = d3.range(130).map(() => {
        const coordinate = randomLandCoordinate();

        return {
            ...coordinate,
            age: Math.random() * 100,
            maxAge: 100 + Math.random() * 140
        };
    });

    windLines = windGroup
        .selectAll("line")
        .data(windParticles)
        .join("line")
        .attr("stroke", "rgba(45, 55, 65, 0.55)")
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke")
        .style("pointer-events", "none");

    windLastFrame = performance.now();

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

        windLines.each(function (particle) {
            const previous = projection([
                particle.longitude,
                particle.latitude
            ]);

            const wind = interpolatedWind(
                particle.longitude,
                particle.latitude,
                windPoints
            );

            if (!previous || !wind) {
                resetParticle(particle);
                d3.select(this).attr("opacity", 0);
                return;
            }

            const rawSpeed = Math.hypot(
    wind.east,
    wind.north
);

const speed = Math.min(
    Math.max(rawSpeed, 0.8),
    15
);

const speedScale =
    rawSpeed > 0
        ? speed / rawSpeed
        : 0;

const east =
    wind.east * speedScale;

const north =
    wind.north * speedScale;

const moveFactor =
    0.006 * frameScale;

const latitudeRadians =
    particle.latitude *
    Math.PI /
    180;

const longitudeScale =
    Math.max(
        0.32,
        Math.cos(latitudeRadians)
    );

            particle.latitude +=
    north * moveFactor;

particle.longitude +=
    east * moveFactor / longitudeScale;

            if (particle.longitude > 180) {
                particle.longitude -= 360;
            } else if (particle.longitude < -180) {
                particle.longitude += 360;
            }

            particle.age += frameScale;

            const isOutside =
                particle.latitude > 78 ||
                particle.latitude < -62;
            const leftLand =
                landFeature &&
                !d3.geoContains(
                    landFeature,
                    [particle.longitude, particle.latitude]
                );

            if (
                particle.age > particle.maxAge ||
                isOutside ||
                leftLand
            ) {
                resetParticle(particle);
                d3.select(this).attr("opacity", 0);
                return;
            }

            const next = projection([
                particle.longitude,
                particle.latitude
            ]);

            if (!next) {
                resetParticle(particle);
                return;
            }

            const dx = next[0] - previous[0];
            const dy = next[1] - previous[1];
            const distance = Math.hypot(dx, dy);

            if (distance < 0.0001) {
                d3.select(this).attr("opacity", 0);
                return;
            }

            // Keep wind trails readable at both world view and deep zoom.
            // The lines live inside mapGroup, so their map-space length must
            // be divided by the current D3 zoom scale to remain roughly
            // constant in screen pixels.
            const zoomScale = d3.zoomTransform(mapSvg.node()).k;
            const screenTrailLength =
                4 + Math.min(speed * 0.35, 4);
            const trailLength = screenTrailLength / zoomScale;
            const directionX = dx / distance;
            const directionY = dy / distance;

            d3.select(this)
                .attr("x1", previous[0])
                .attr("y1", previous[1])
                .attr(
                    "x2",
                    previous[0] + directionX * trailLength
                )
                .attr(
                    "y2",
                    previous[1] + directionY * trailLength
                )
                .attr(
                    "opacity",
                    Math.min(0.78, 0.42 + speed / 60)
                );
        });

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
        longitude: coordinates[0],
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

        renderTemperatureLayer(
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

            renderTemperatureLayer(
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

    renderTemperatureLayer(
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
        throw new Error(`Realtime map failed: ${response.status}`);
    }

    const data = await response.json();
    realtimeBasePoints = data.points ?? [];
    realtimePrecipitationPoints = [];
    realtimePrecipitationDetailPoints = [];

    renderCloudLayer(realtimeBasePoints);
    startWindAnimation(realtimeBasePoints);

    if (mapMetric === "precipitation") {
        await loadRealtimePrecipitationMap();
    } else {
        currentMapPoints = realtimeBasePoints;
        renderTemperatureLayer(currentMapPoints);
    }

    updateMetricControls();
    hideMapError();
    hideLoading();
}

async function loadForecastMap() {
    forecastMonthSelect.disabled = true;

    showLoading(
        `Loading ${formatMonth(selectedForecastMonth)} forecast…`
    );

    stopWindAnimation();
    windGroup.style("display", "none");
    cloudGroup.style("display", "none");

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

    renderTemperatureLayer(currentMapPoints);

    updateMetricControls();
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
    if (!cityGroup) {
        return;
    }

    let rankThreshold = 1;

    if (scale >= 1.7) {
        rankThreshold = 3;
    }

    if (scale >= 3) {
        rankThreshold = 6;
    }

    if (scale >= 5) {
        rankThreshold = 10;
    }

    cityGroup
        .selectAll(".city-place")
        .style("display", (city) => {
            const properties = city.properties ?? {};
            const scaleRank = Number(properties.scalerank ?? 99);
            const isCapital = Number(properties.adm0cap ?? 0) === 1;

            const visible = scale < 1.7
                ? scaleRank <= 1
                : isCapital || scaleRank <= rankThreshold;

            return visible ? null : "none";
        });

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

function setMarker(latitude, longitude) {
    const projected = projection([longitude, latitude]);

    if (!projected) {
        return;
    }

    selectionMarker
        .attr("cx", projected[0])
        .attr("cy", projected[1])
        .style("display", null)
        .raise();
}

function setComparisonMarker(latitude, longitude) {
    const projected = projection([longitude, latitude]);

    if (!projected) {
        return;
    }

    comparisonMarker
        .attr("cx", projected[0])
        .attr("cy", projected[1])
        .style("display", null)
        .raise();
}

function clearComparison() {
    const hadComparison = compareModeActive || compareBaseLocation || comparisonMarker.style("display") !== "none";
    compareModeActive = false;
    compareBaseLocation = null;
    comparisonMarker.style("display", "none");
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
    const latitude = Number(params.get("lat"));
    const longitude = Number(params.get("lon"));

    if (mode === "forecast" || mode === "realtime") {
        mapMode = mode;
    }

    if (["temperature", "precipitation", "wind"].includes(metric)) {
        mapMetric = metric;
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

    if (
        mapMode === "realtime" &&
        mapMetric === "precipitation"
    ) {
        clearTimeout(precipitationDetailTimer);

        precipitationDetailTimer =
            setTimeout(() => {
                void loadRealtimePrecipitationDetail();
            }, 150);
    }
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

    const [longitude, latitude] = coordinates;

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
        return mapMode === "forecast" ? "Monthly precipitation mean" : "Current precipitation";
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
        if (!Number.isFinite(point.precipitation)) {
            return "Precipitation unavailable";
        }

        const anomaly = mapMode === "forecast" && Number.isFinite(point.precipitationAnomaly)
            ? `<br><span>${point.precipitationAnomaly >= 0 ? "+" : ""}${point.precipitationAnomaly.toFixed(1)} mm anomaly</span>`
            : "";

        return `${point.precipitation.toFixed(1)} mm${anomaly}`;
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
            const countryName = country.properties.name;

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

            mapTooltip
                .style("display", "block")
                .html(`
                    <strong>${countryName}</strong><br>
                    <span>${mapMetricLabel()}</span>
                `);
        })
        .on("mousemove", function (event, country) {
            const mapElement = document.getElementById("map");
            const [tooltipX, tooltipY] = d3.pointer(
                event,
                mapElement
            );

            mapTooltip
                .style("left", `${tooltipX + 14}px`)
                .style("top", `${tooltipY + 14}px`);

            const [x, y] = d3.pointer(event, mapSvg.node());
            const transform = d3.zoomTransform(mapSvg.node());
            const mapPoint = transform.invert([x, y]);
            const coordinates = projection.invert(mapPoint);

            if (!coordinates) {
                return;
            }

            const [longitude, latitude] = coordinates;

            const point = nearestMapPoint(longitude, latitude);

            if (!point) {
                return;
            }

            const period = mapMode === "forecast"
                ? `${formatMonth(selectedForecastMonth)} · `
                : "";

            mapTooltip.html(`
                <strong>${country.properties.name}</strong><br>
                ${period}${mapMetricTooltip(point)}
            `);
        })
        .on("mouseleave", function () {
            clearTimeout(hoverWeatherTimer);
            hoverRequestId += 1;

            hoverCountry
                .interrupt()
                .transition()
                .duration(130)
                .ease(d3.easeCubicIn)
                .attr("transform", null)
                .style("opacity", 0);

            mapTooltip.style("display", "none");
        });
}

async function initializeMap() {
    populateForecastMonths();
    applyInitialUrlState();
    updateModeControls();

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

    projection = d3
        .geoNaturalEarth1()
        .fitSize(
            [mapWidth, mapHeight],
            {
                type: "FeatureCollection",
                features: countries
            }
        );

    path = d3.geoPath(projection);

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
        .attr("stdDeviation", 7);

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
        .attr("clip-path", "url(#land-clip)")
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
            if (metric === "precipitation") {
                await loadRealtimePrecipitationMap();
            } else {
                currentMapPoints = realtimeBasePoints;
                renderTemperatureLayer(currentMapPoints);
            }
        } else {
            renderTemperatureLayer(currentMapPoints);
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
