const analyticsResult = document.getElementById("analytics-result");
const compareResult = document.getElementById("compare-result");
const aboutDataButton = document.getElementById("about-data-button");
const dataModal = document.getElementById("data-modal");
const dataModalClose = document.getElementById("data-modal-close");

let analyticsRequestId = 0;
let compareRequestId = 0;

function formatCompactLocation(location) {
    if (location?.name) {
        return location.name;
    }

    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
    }

    return "Location";
}

function formatChartX(value) {
    const text = String(value);

    if (/^\d{4}-\d{2}$/.test(text)) {
        const [year, month] = text.split("-").map(Number);
        return new Intl.DateTimeFormat("en", {
            month: "short",
            timeZone: "UTC"
        }).format(new Date(Date.UTC(year, month - 1, 1)));
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}/.test(text)) {
        return text.slice(11, 16);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const date = new Date(`${text}T00:00:00Z`);
        return new Intl.DateTimeFormat("en", {
            weekday: "short",
            timeZone: "UTC"
        }).format(date);
    }

    return text;
}

function finiteSeries(spec) {
    return (spec.series ?? [])
        .map((series) => ({
            ...series,
            points: (series.points ?? []).filter((point) =>
                Number.isFinite(Number(point.y))
            )
        }))
        .filter((series) => series.points.length);
}

function renderLineChart(container, spec) {
    const series = finiteSeries(spec);

    if (!series.length) {
        container.textContent = "No chart data available.";
        return;
    }

    const width = 340;
    const height = 178;
    const margin = { top: 12, right: 12, bottom: 28, left: 37 };
    const allPoints = series.flatMap((item) => item.points);
    const xValues = [...new Set(allPoints.map((point) => String(point.x)))];
    const yValues = allPoints.map((point) => Number(point.y));
    let [yMin, yMax] = d3.extent(yValues);

    if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
    }

    const padding = Math.max(0.8, (yMax - yMin) * 0.12);
    const x = d3
        .scalePoint()
        .domain(xValues)
        .range([margin.left, width - margin.right])
        .padding(0.25);
    const y = d3
        .scaleLinear()
        .domain([yMin - padding, yMax + padding])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const svg = d3
        .select(container)
        .append("svg")
        .attr("class", "climate-chart")
        .attr("viewBox", `0 0 ${width} ${height}`);

    svg
        .append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3
                .axisLeft(y)
                .ticks(4)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat("")
        );

    const tickStep = Math.max(1, Math.ceil(xValues.length / 5));
    const tickValues = xValues.filter((_, index) => index % tickStep === 0);

    svg
        .append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(
            d3
                .axisBottom(x)
                .tickValues(tickValues)
                .tickFormat(formatChartX)
                .tickSizeOuter(0)
        );

    svg
        .append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

    const line = d3
        .line()
        .x((point) => x(String(point.x)))
        .y((point) => y(Number(point.y)))
        .curve(d3.curveMonotoneX);

    series.forEach((item, index) => {
        const color = d3.schemeTableau10[index % d3.schemeTableau10.length];

        svg
            .append("path")
            .datum(item.points)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1.8)
            .attr("d", line);

        svg
            .append("g")
            .selectAll("circle")
            .data(item.points)
            .join("circle")
            .attr("cx", (point) => x(String(point.x)))
            .attr("cy", (point) => y(Number(point.y)))
            .attr("r", (point) =>
                spec.highlightX && String(point.x) === String(spec.highlightX)
                    ? 3.4
                    : 1.9
            )
            .attr("fill", color);
    });

    if (Number.isFinite(Number(spec.referenceY))) {
        const referenceY = Number(spec.referenceY);

        if (referenceY >= y.domain()[0] && referenceY <= y.domain()[1]) {
            svg
                .append("line")
                .attr("x1", margin.left)
                .attr("x2", width - margin.right)
                .attr("y1", y(referenceY))
                .attr("y2", y(referenceY))
                .attr("stroke", "#777777")
                .attr("stroke-width", 0.8)
                .attr("stroke-dasharray", "3 3");
        }
    }

    const legend = document.createElement("div");
    legend.className = "chart-legend";

    series.forEach((item, index) => {
        const legendItem = document.createElement("span");
        legendItem.className = "chart-legend-item";
        legendItem.style.color = d3.schemeTableau10[index % d3.schemeTableau10.length];
        legendItem.innerHTML = `<span class="chart-legend-swatch"></span><span>${item.name}</span>`;
        legend.appendChild(legendItem);
    });

    container.appendChild(legend);
}

function renderBarChart(container, spec) {
    const series = finiteSeries(spec);
    const points = series[0]?.points ?? [];

    if (!points.length) {
        container.textContent = "No chart data available.";
        return;
    }

    const width = 340;
    const height = 170;
    const margin = { top: 12, right: 12, bottom: 32, left: 37 };
    const values = points.map((point) => Number(point.y));
    const min = Math.min(0, d3.min(values));
    const max = Math.max(0, d3.max(values));
    const x = d3
        .scaleBand()
        .domain(points.map((point) => String(point.x)))
        .range([margin.left, width - margin.right])
        .padding(0.3);
    const y = d3
        .scaleLinear()
        .domain([min, max])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const svg = d3
        .select(container)
        .append("svg")
        .attr("class", "climate-chart")
        .attr("viewBox", `0 0 ${width} ${height}`);

    svg
        .append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${y(0)})`)
        .call(d3.axisBottom(x).tickFormat(formatChartX).tickSizeOuter(0));

    svg
        .append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

    svg
        .append("g")
        .selectAll("rect")
        .data(points)
        .join("rect")
        .attr("x", (point) => x(String(point.x)))
        .attr("width", x.bandwidth())
        .attr("y", (point) => y(Math.max(0, Number(point.y))))
        .attr("height", (point) => Math.abs(y(Number(point.y)) - y(0)))
        .attr("fill", d3.schemeTableau10[0]);
}

function renderChartSpec(container, spec) {
    container.innerHTML = "";

    if (!spec) {
        return;
    }

    if (spec.title) {
        const title = document.createElement("div");
        title.className = "chart-title";
        title.textContent = spec.title;
        container.appendChild(title);
    }

    const chartHost = document.createElement("div");
    container.appendChild(chartHost);

    if (spec.type === "bar") {
        renderBarChart(chartHost, spec);
    } else {
        renderLineChart(chartHost, spec);
    }
}

window.renderClimateChart = renderChartSpec;

function renderDailyRows(daily) {
    const rows = daily.slice(0, 7).map((day) => {
        const date = new Date(`${day.date}T00:00:00Z`);
        const label = new Intl.DateTimeFormat("en", {
            weekday: "short",
            timeZone: "UTC"
        }).format(date);
        const precipitation = Number.isFinite(day.precipitationProbability)
            ? `${day.precipitationProbability}% rain`
            : "rain n/a";
        const wind = Number.isFinite(day.windSpeedMax)
            ? `${day.windSpeedMax.toFixed(1)} m/s wind`
            : "wind n/a";
        const temperature =
            Number.isFinite(day.temperatureMax) && Number.isFinite(day.temperatureMin)
                ? `${day.temperatureMin.toFixed(0)}° / ${day.temperatureMax.toFixed(0)}°`
                : "—";

        return `
            <div class="daily-row">
                <div class="daily-date">${label}</div>
                <div class="daily-secondary">${precipitation} · ${wind}</div>
                <div class="daily-temperature">${temperature}</div>
            </div>
        `;
    }).join("");

    return `<div class="daily-strip">${rows}</div>`;
}

async function loadLocationAnalytics(detail) {
    const requestId = ++analyticsRequestId;
    const { location, mode, month } = detail;
    const params = new URLSearchParams({
        lat: location.latitude,
        lon: location.longitude
    });

    analyticsResult.hidden = false;
    analyticsResult.innerHTML = `<div class="analytics-loading">Loading analytics…</div>`;

    try {
        if (mode === "forecast") {
            const response = await fetch(`/api/analytics/seasonal-profile?${params}`);

            if (!response.ok) {
                throw new Error(`Seasonal analytics failed: ${response.status}`);
            }

            const profile = await response.json();

            if (requestId !== analyticsRequestId) {
                return;
            }

            const selected = profile.months.find((item) => item.month === month);
            analyticsResult.innerHTML = `
                <div class="section-heading-row">
                    <div>
                        <div class="section-kicker">Analytics</div>
                        <h3>Seasonal profile</h3>
                    </div>
                    <div class="section-meta">ECMWF SEAS5</div>
                </div>
                <div id="seasonal-chart" class="chart-wrap"></div>
                ${selected ? `
                    <div class="weather-details forecast-details">
                        <div class="weather-detail">
                            <span>Precipitation mean</span>
                            <strong>${Number.isFinite(selected.precipitation) ? `${selected.precipitation.toFixed(1)} mm` : "—"}</strong>
                        </div>
                        <div class="weather-detail">
                            <span>Mean wind</span>
                            <strong>${Number.isFinite(selected.windSpeed) ? `${selected.windSpeed.toFixed(1)} m/s` : "—"}</strong>
                        </div>
                    </div>
                ` : ""}
                <p class="section-note">Monthly values are ensemble means and should be interpreted as a broad outlook.</p>
            `;

            renderChartSpec(
                document.getElementById("seasonal-chart"),
                {
                    type: "line",
                    title: "Mean temperature and anomaly",
                    highlightX: month,
                    referenceY: 0,
                    series: [
                        {
                            name: "Mean temperature",
                            points: profile.months.map((item) => ({
                                x: item.month,
                                y: item.temperature
                            }))
                        },
                        {
                            name: "Anomaly",
                            points: profile.months.map((item) => ({
                                x: item.month,
                                y: item.temperatureAnomaly
                            }))
                        }
                    ]
                }
            );

            return;
        }

        const response = await fetch(`/api/analytics/location?${params}`);

        if (!response.ok) {
            throw new Error(`Location analytics failed: ${response.status}`);
        }

        const analytics = await response.json();

        if (requestId !== analyticsRequestId) {
            return;
        }

        analyticsResult.innerHTML = `
            <div class="section-heading-row">
                <div>
                    <div class="section-kicker">Analytics</div>
                    <h3>24 hours & 7 days</h3>
                </div>
                <div class="section-meta">Open-Meteo</div>
            </div>
            <div id="hourly-temperature-chart" class="chart-wrap"></div>
            ${renderDailyRows(analytics.daily ?? [])}
        `;

        renderChartSpec(
            document.getElementById("hourly-temperature-chart"),
            {
                type: "line",
                title: "Temperature · next 24 hours",
                series: [
                    {
                        name: "Temperature",
                        points: (analytics.hourly ?? []).map((item) => ({
                            x: item.time,
                            y: item.temperature
                        }))
                    }
                ]
            }
        );
    } catch (error) {
        console.error(error);

        if (requestId !== analyticsRequestId) {
            return;
        }

        analyticsResult.innerHTML = `
            <div class="section-kicker">Analytics</div>
            <div class="analytics-error">Analytics are temporarily unavailable.</div>
        `;
    }
}

function averageDailyTemperature(item) {
    if (!Number.isFinite(item.temperatureMax) || !Number.isFinite(item.temperatureMin)) {
        return null;
    }

    return (item.temperatureMax + item.temperatureMin) / 2;
}

async function loadComparison(detail) {
    const requestId = ++compareRequestId;
    const { first, second, mode } = detail;
    const firstName = formatCompactLocation(first);
    const secondName = formatCompactLocation(second);
    const params = new URLSearchParams({
        lat1: first.latitude,
        lon1: first.longitude,
        lat2: second.latitude,
        lon2: second.longitude,
        mode
    });

    compareResult.hidden = false;
    compareResult.innerHTML = `<div class="analytics-loading">Comparing locations…</div>`;

    try {
        const response = await fetch(`/api/analytics/compare?${params}`);

        if (!response.ok) {
            throw new Error(`Comparison failed: ${response.status}`);
        }

        const comparison = await response.json();

        if (requestId !== compareRequestId) {
            return;
        }

        compareResult.innerHTML = `
            <div class="comparison-header">
                <div>
                    <div class="section-kicker">Compare</div>
                    <h3>${firstName} · ${secondName}</h3>
                </div>
                <button id="clear-comparison-button" class="text-button" type="button">Clear</button>
            </div>
            <div id="comparison-chart" class="chart-wrap"></div>
        `;

        const spec = comparison.mode === "forecast"
            ? {
                type: "line",
                title: "Seasonal mean temperature",
                series: [
                    {
                        name: firstName,
                        points: comparison.first.months.map((item) => ({
                            x: item.month,
                            y: item.temperature
                        }))
                    },
                    {
                        name: secondName,
                        points: comparison.second.months.map((item) => ({
                            x: item.month,
                            y: item.temperature
                        }))
                    }
                ]
            }
            : {
                type: "line",
                title: "7-day mean temperature",
                series: [
                    {
                        name: firstName,
                        points: comparison.first.daily.map((item) => ({
                            x: item.date,
                            y: averageDailyTemperature(item)
                        }))
                    },
                    {
                        name: secondName,
                        points: comparison.second.daily.map((item) => ({
                            x: item.date,
                            y: averageDailyTemperature(item)
                        }))
                    }
                ]
            };

        renderChartSpec(document.getElementById("comparison-chart"), spec);

        document
            .getElementById("clear-comparison-button")
            ?.addEventListener("click", () => {
                window.clearMapComparison?.();
            });
    } catch (error) {
        console.error(error);

        if (requestId !== compareRequestId) {
            return;
        }

        compareResult.innerHTML = `
            <div class="section-kicker">Compare</div>
            <div class="analytics-error">Comparison is temporarily unavailable.</div>
        `;
    }
}

window.addEventListener("climate:location-selected", (event) => {
    loadLocationAnalytics(event.detail);
});

window.addEventListener("climate:compare-request", (event) => {
    loadComparison(event.detail);
});

window.addEventListener("climate:comparison-cleared", () => {
    compareRequestId += 1;
    compareResult.hidden = true;
    compareResult.innerHTML = "";
});

function setModalOpen(open) {
    dataModal.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
}

aboutDataButton.addEventListener("click", () => setModalOpen(true));
dataModalClose.addEventListener("click", () => setModalOpen(false));
dataModal.addEventListener("click", (event) => {
    if (event.target.dataset.closeModal === "true") {
        setModalOpen(false);
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dataModal.hidden) {
        setModalOpen(false);
    }
});
