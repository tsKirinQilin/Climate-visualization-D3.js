const analyticsResult = document.getElementById("analytics-result");
const compareResult = document.getElementById("compare-result");
const aboutDataButton = document.getElementById("about-data-button");
const dataModal = document.getElementById("data-modal");
const dataModalClose = document.getElementById("data-modal-close");
const exportCsvButton = document.getElementById("export-csv-button");

let analyticsRequestId = 0;
let compareRequestId = 0;
let latestLocationDetail = null;

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

const analyticsPrefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
const CHART_TRANSITION_MS = analyticsPrefersReducedMotion ? 0 : 720;

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
    const x = d3.scalePoint()
        .domain(xValues)
        .range([margin.left, width - margin.right])
        .padding(0.25);
    const y = d3.scaleLinear()
        .domain([yMin - padding, yMax + padding])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const host = d3.select(container);
    host.selectAll(".chart-empty").remove();

    const svg = host
        .selectAll("svg.climate-chart")
        .data([null])
        .join("svg")
        .attr("class", "climate-chart")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const transition = svg.transition("chart-update")
        .duration(CHART_TRANSITION_MS)
        .ease(d3.easeCubicInOut);

    const tickStep = Math.max(1, Math.ceil(xValues.length / 5));
    const tickValues = xValues.filter((_, index) => index % tickStep === 0);

    svg.selectAll("g.grid")
        .data([null])
        .join("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .transition(transition)
        .call(
            d3.axisLeft(y)
                .ticks(4)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat("")
        );

    svg.selectAll("g.axis-x")
        .data([null])
        .join("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .transition(transition)
        .call(
            d3.axisBottom(x)
                .tickValues(tickValues)
                .tickFormat(formatChartX)
                .tickSizeOuter(0)
        );

    svg.selectAll("g.axis-y")
        .data([null])
        .join("g")
        .attr("class", "axis axis-y")
        .attr("transform", `translate(${margin.left},0)`)
        .transition(transition)
        .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

    const line = d3.line()
        .x((point) => x(String(point.x)))
        .y((point) => y(Number(point.y)))
        .curve(d3.curveMonotoneX);

    const seriesGroups = svg.selectAll("g.chart-series")
        .data(series, (item) => item.name)
        .join(
            (enter) => enter.append("g")
                .attr("class", "chart-series")
                .attr("opacity", 0),
            (update) => update,
            (exit) => exit
                .transition("series-exit")
                .duration(CHART_TRANSITION_MS / 2)
                .attr("opacity", 0)
                .remove()
        );

    seriesGroups.each(function (item, index) {
        const group = d3.select(this);
        const color = d3.schemeTableau10[index % d3.schemeTableau10.length];
        const pathJoin = group.selectAll("path.series-line")
            .data([item.points]);
        const pathEnter = pathJoin.enter()
            .append("path")
            .attr("class", "series-line")
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1.9)
            .attr("stroke-linecap", "round")
            .attr("stroke-linejoin", "round")
            .attr("d", line);

        pathEnter.each(function () {
            if (prefersReducedMotion) return;
            const length = this.getTotalLength?.() ?? 0;
            if (length > 0) {
                d3.select(this)
                    .attr("stroke-dasharray", `${length} ${length}`)
                    .attr("stroke-dashoffset", length)
                    .transition("line-draw")
                    .delay(index * 130)
                    .duration(CHART_TRANSITION_MS + 180)
                    .ease(d3.easeCubicOut)
                    .attr("stroke-dashoffset", 0)
                    .on("end", function () {
                        d3.select(this)
                            .attr("stroke-dasharray", null)
                            .attr("stroke-dashoffset", null);
                    });
            }
        });

        pathJoin.merge(pathEnter)
            .attr("stroke", color)
            .transition("line-morph")
            .delay(index * 90)
            .duration(CHART_TRANSITION_MS)
            .ease(d3.easeCubicInOut)
            .attr("d", line);

        const points = group.selectAll("circle.series-point")
            .data(item.points, (point) => String(point.x));

        points.join(
            (enter) => enter.append("circle")
                .attr("class", "series-point")
                .attr("cx", (point) => x(String(point.x)))
                .attr("cy", (point) => y(Number(point.y)))
                .attr("r", 0)
                .attr("fill", color)
                .attr("opacity", 0),
            (update) => update,
            (exit) => exit.transition("point-exit")
                .duration(CHART_TRANSITION_MS / 2)
                .attr("r", 0)
                .attr("opacity", 0)
                .remove()
        )
            .on("mouseenter", function () {
                d3.select(this)
                    .interrupt("point-hover")
                    .transition("point-hover")
                    .duration(140)
                    .attr("r", 4.2);
            })
            .on("mouseleave", function (event, point) {
                d3.select(this)
                    .interrupt("point-hover")
                    .transition("point-hover")
                    .duration(160)
                    .attr("r", spec.highlightX && String(point.x) === String(spec.highlightX) ? 3.6 : 2.1);
            })
            .transition("point-update")
            .delay((_, pointIndex) => Math.min(280, pointIndex * 12) + index * 80)
            .duration(CHART_TRANSITION_MS)
            .ease(d3.easeCubicOut)
            .attr("cx", (point) => x(String(point.x)))
            .attr("cy", (point) => y(Number(point.y)))
            .attr("r", (point) =>
                spec.highlightX && String(point.x) === String(spec.highlightX)
                    ? 3.6
                    : 2.1
            )
            .attr("fill", color)
            .attr("opacity", 1);

        group
            .transition("series-fade")
            .delay(index * 90)
            .duration(CHART_TRANSITION_MS / 2)
            .attr("opacity", 1);
    });

    const referenceData = Number.isFinite(Number(spec.referenceY))
        && Number(spec.referenceY) >= y.domain()[0]
        && Number(spec.referenceY) <= y.domain()[1]
        ? [Number(spec.referenceY)]
        : [];

    svg.selectAll("line.reference-line")
        .data(referenceData)
        .join(
            (enter) => enter.append("line")
                .attr("class", "reference-line")
                .attr("x1", margin.left)
                .attr("x2", margin.left)
                .attr("stroke", "#777777")
                .attr("stroke-width", 0.8)
                .attr("stroke-dasharray", "3 3")
                .attr("opacity", 0),
            (update) => update,
            (exit) => exit.transition("reference-exit")
                .duration(CHART_TRANSITION_MS / 2)
                .attr("opacity", 0)
                .remove()
        )
        .transition("reference-update")
        .duration(CHART_TRANSITION_MS)
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", (value) => y(value))
        .attr("y2", (value) => y(value))
        .attr("opacity", 1);

    const legend = d3.select(container)
        .selectAll("div.chart-legend")
        .data([null])
        .join("div")
        .attr("class", "chart-legend");

    legend.selectAll("span.chart-legend-item")
        .data(series, (item) => item.name)
        .join(
            (enter) => {
                const item = enter.append("span")
                    .attr("class", "chart-legend-item")
                    .style("opacity", 0);
                item.append("span").attr("class", "chart-legend-swatch");
                item.append("span").attr("class", "chart-legend-label");
                return item;
            },
            (update) => update,
            (exit) => exit.remove()
        )
        .style("color", (_, index) => d3.schemeTableau10[index % d3.schemeTableau10.length])
        .each(function (item) {
            d3.select(this).select(".chart-legend-label").text(item.name);
        })
        .transition("legend-in")
        .duration(CHART_TRANSITION_MS / 2)
        .style("opacity", 1);
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
    const x = d3.scaleBand()
        .domain(points.map((point) => String(point.x)))
        .range([margin.left, width - margin.right])
        .padding(0.3);
    const y = d3.scaleLinear()
        .domain([min, max])
        .nice()
        .range([height - margin.bottom, margin.top]);

    const svg = d3.select(container)
        .selectAll("svg.climate-chart")
        .data([null])
        .join("svg")
        .attr("class", "climate-chart")
        .attr("viewBox", `0 0 ${width} ${height}`);

    svg.selectAll("g.axis-x")
        .data([null])
        .join("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0,${y(0)})`)
        .transition("axis")
        .duration(CHART_TRANSITION_MS)
        .call(d3.axisBottom(x).tickFormat(formatChartX).tickSizeOuter(0));

    svg.selectAll("g.axis-y")
        .data([null])
        .join("g")
        .attr("class", "axis axis-y")
        .attr("transform", `translate(${margin.left},0)`)
        .transition("axis")
        .duration(CHART_TRANSITION_MS)
        .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

    const bars = svg.selectAll("rect.chart-bar")
        .data(points, (point) => String(point.x));

    bars.join(
        (enter) => enter.append("rect")
            .attr("class", "chart-bar")
            .attr("x", (point) => x(String(point.x)))
            .attr("width", x.bandwidth())
            .attr("y", y(0))
            .attr("height", 0)
            .attr("rx", 1.5)
            .attr("fill", d3.schemeTableau10[0])
            .attr("opacity", 0.2),
        (update) => update,
        (exit) => exit.transition("bar-exit")
            .duration(CHART_TRANSITION_MS / 2)
            .attr("y", y(0))
            .attr("height", 0)
            .attr("opacity", 0)
            .remove()
    )
        .transition("bar-update")
        .delay((_, index) => Math.min(index * 45, 320))
        .duration(CHART_TRANSITION_MS)
        .ease(d3.easeCubicOut)
        .attr("x", (point) => x(String(point.x)))
        .attr("width", x.bandwidth())
        .attr("y", (point) => y(Math.max(0, Number(point.y))))
        .attr("height", (point) => Math.abs(y(Number(point.y)) - y(0)))
        .attr("opacity", 0.9);
}

function renderChartSpec(container, spec) {
    if (!spec) {
        container.innerHTML = "";
        return;
    }

    let title = container.querySelector(":scope > .chart-title");
    if (spec.title) {
        if (!title) {
            title = document.createElement("div");
            title.className = "chart-title";
            container.prepend(title);
        }
        title.textContent = spec.title;
    } else if (title) {
        title.remove();
    }

    let chartHost = container.querySelector(":scope > .chart-host");
    if (!chartHost) {
        chartHost = document.createElement("div");
        chartHost.className = "chart-host";
        container.appendChild(chartHost);
    }

    const nextType = spec.type === "bar" ? "bar" : "line";
    if (chartHost.dataset.chartType && chartHost.dataset.chartType !== nextType) {
        chartHost.innerHTML = "";
    }
    chartHost.dataset.chartType = nextType;

    if (nextType === "bar") {
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
                            <span>Precipitation anomaly</span>
                            <strong>${Number.isFinite(selected.precipitationAnomaly) ? `${selected.precipitationAnomaly >= 0 ? "+" : ""}${selected.precipitationAnomaly.toFixed(1)} mm` : "—"}</strong>
                        </div>
                        <div class="weather-detail">
                            <span>Mean wind</span>
                            <strong>${Number.isFinite(selected.windSpeed) ? `${selected.windSpeed.toFixed(1)} m/s` : "—"}</strong>
                        </div>
                        <div class="weather-detail">
                            <span>Wind anomaly</span>
                            <strong>${Number.isFinite(selected.windSpeedAnomaly) ? `${selected.windSpeedAnomaly >= 0 ? "+" : ""}${selected.windSpeedAnomaly.toFixed(1)} m/s` : "—"}</strong>
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
    const existingComparisonChart = compareResult.querySelector("#comparison-chart");
    if (existingComparisonChart) {
        compareResult.classList.add("is-updating");
    } else {
        compareResult.innerHTML = `<div class="analytics-loading">Comparing locations…</div>`;
    }

    try {
        const response = await fetch(`/api/analytics/compare?${params}`);

        if (!response.ok) {
            throw new Error(`Comparison failed: ${response.status}`);
        }

        const comparison = await response.json();

        if (requestId !== compareRequestId) {
            return;
        }

        let comparisonChart = compareResult.querySelector("#comparison-chart");

        if (!comparisonChart) {
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
            comparisonChart = compareResult.querySelector("#comparison-chart");
        } else {
            const heading = compareResult.querySelector(".comparison-header h3");
            if (heading) heading.textContent = `${firstName} · ${secondName}`;
        }

        compareResult.classList.remove("is-updating");

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

        renderChartSpec(comparisonChart, spec);

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
    latestLocationDetail = event.detail;
    exportCsvButton.disabled = false;
    exportCsvButton.title = "Export selected location analytics as CSV";
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

function csvCell(value) {
    if (value === null || value === undefined) {
        return "";
    }

    const text = String(value);
    return /[",\n]/.test(text)
        ? `"${text.replaceAll('"', '""')}"`
        : text;
}

function rowsToCsv(headers, rows) {
    return [
        headers.map(csvCell).join(","),
        ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
    ].join("\n");
}

function downloadCsv(filename, csv) {
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function exportFileName(detail) {
    const name = formatCompactLocation(detail.location)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "location";
    const suffix = detail.mode === "forecast" ? "seasonal" : "short-range";
    return `${name}-${suffix}.csv`;
}

async function exportSelectedLocationCsv() {
    if (!latestLocationDetail || exportCsvButton.disabled) {
        return;
    }

    const detail = latestLocationDetail;
    const { location, mode } = detail;
    const originalText = exportCsvButton.textContent;
    exportCsvButton.disabled = true;
    exportCsvButton.textContent = "Exporting…";

    try {
        const params = new URLSearchParams({
            lat: location.latitude,
            lon: location.longitude
        });

        if (mode === "forecast") {
            const response = await fetch(`/api/analytics/seasonal-profile?${params}`);
            if (!response.ok) throw new Error(`CSV export failed: ${response.status}`);
            const profile = await response.json();
            const headers = [
                "month",
                "temperature_mean_c",
                "temperature_anomaly_c",
                "precipitation_mean_mm",
                "precipitation_anomaly_mm",
                "wind_speed_mean_m_s",
                "wind_speed_anomaly_m_s"
            ];
            const rows = (profile.months ?? []).map((item) => ({
                month: item.month,
                temperature_mean_c: item.temperature,
                temperature_anomaly_c: item.temperatureAnomaly,
                precipitation_mean_mm: item.precipitation,
                precipitation_anomaly_mm: item.precipitationAnomaly,
                wind_speed_mean_m_s: item.windSpeed,
                wind_speed_anomaly_m_s: item.windSpeedAnomaly
            }));

            downloadCsv(exportFileName(detail), rowsToCsv(headers, rows));
            return;
        }

        const response = await fetch(`/api/analytics/location?${params}`);
        if (!response.ok) throw new Error(`CSV export failed: ${response.status}`);
        const analytics = await response.json();
        const headers = [
            "period_type",
            "time_or_date",
            "temperature_c",
            "temperature_min_c",
            "temperature_max_c",
            "precipitation_probability_percent",
            "precipitation_mm",
            "wind_speed_m_s"
        ];
        const rows = [
            ...(analytics.hourly ?? []).map((item) => ({
                period_type: "hourly",
                time_or_date: item.time,
                temperature_c: item.temperature,
                temperature_min_c: null,
                temperature_max_c: null,
                precipitation_probability_percent: item.precipitationProbability,
                precipitation_mm: null,
                wind_speed_m_s: item.windSpeed
            })),
            ...(analytics.daily ?? []).map((item) => ({
                period_type: "daily",
                time_or_date: item.date,
                temperature_c: null,
                temperature_min_c: item.temperatureMin,
                temperature_max_c: item.temperatureMax,
                precipitation_probability_percent: item.precipitationProbability,
                precipitation_mm: item.precipitation,
                wind_speed_m_s: item.windSpeedMax
            }))
        ];

        downloadCsv(exportFileName(detail), rowsToCsv(headers, rows));
    } catch (error) {
        console.error(error);
        exportCsvButton.title = "Export failed. Try again.";
    } finally {
        exportCsvButton.disabled = false;
        exportCsvButton.textContent = originalText;
    }
}

exportCsvButton.addEventListener("click", () => {
    void exportSelectedLocationCsv();
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
