const searchInput = document.getElementById("location-search");
const searchButton = document.getElementById("search-button");
const searchResults = document.getElementById("search-results");
const weatherResult = document.getElementById("weather-result");
const clockLocation = document.getElementById("clock-location");
const clockTime = document.getElementById("clock-time");

let activeTimezoneOffset =
    -new Date().getTimezoneOffset() * 60;

let activeClockLocation = "Local time";

const regionNames = new Intl.DisplayNames(
    ["en"],
    { type: "region" }
);

function updateClock() {
    const locationTime = new Date(
        Date.now() + activeTimezoneOffset * 1000
    );

    clockLocation.textContent = activeClockLocation;

    clockTime.textContent = locationTime.toLocaleTimeString(
        "en-GB",
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: "UTC"
        }
    );
}

function setClockFromWeather(weather) {
    activeClockLocation = weather.location.name || "Selected location";
    activeTimezoneOffset = weather.location.timezoneOffset ?? 0;
    updateClock();
}


function cacheFreshness(cache) {
    const status = String(cache?.status ?? "");
    if (!status.startsWith("cache")) {
        return "live";
    }

    const ageMinutes = Number.isFinite(cache?.ageMs)
        ? Math.max(0, Math.round(cache.ageMs / 60000))
        : null;

    return ageMinutes === null
        ? "cached fallback"
        : `cached fallback · ${ageMinutes} min old`;
}

function countryNameFromCode(countryCode) {
    if (!countryCode) {
        return "Selected location";
    }

    try {
        return regionNames.of(countryCode) ?? countryCode;
    } catch {
        return countryCode;
    }
}

function formatMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);

    return new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatMaybeNumber(value, digits = 1, suffix = "") {
    return Number.isFinite(Number(value))
        ? `${Number(value).toFixed(digits)}${suffix}`
        : "Unavailable";
}

function renderWeather(weather) {
    window.__climateCurrentWeather = weather;
    window.__climateForecastPoint = null;

    const countryName = countryNameFromCode(
        weather.location.country
    );

    const observedTime = new Date(
        new Date(weather.observedAt).getTime() +
        weather.location.timezoneOffset * 1000
    ).toLocaleTimeString(
        "en-GB",
        {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC"
        }
    );

    const observationAgeMinutes = Math.max(
        0,
        Math.round((Date.now() - new Date(weather.observedAt).getTime()) / 60000)
    );
    const freshnessText = observationAgeMinutes <= 1
        ? "fresh observation"
        : `${observationAgeMinutes} min old`;

    weatherResult.innerHTML = `
        <div class="weather-country">
            ${countryName}
        </div>

        <h2 class="weather-location">
            ${weather.location.name || "Selected location"}
        </h2>

        <div class="weather-temperature">
            ${formatMaybeNumber(weather.weather.temperature, 1, "°")}
        </div>

        <div class="weather-condition">
            ${weather.weather.description}
        </div>

        <div class="weather-updated">
            Updated ${observedTime}
        </div>
        <div class="weather-source-meta">
            OpenWeather observation · ${freshnessText} · ${cacheFreshness(weather.cache)}
        </div>

        <div class="weather-details">
            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">🌡️</span>
                    Feels like
                </span>
                <strong>${formatMaybeNumber(weather.weather.feelsLike, 1, " °C")}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">💧</span>
                    Humidity
                </span>
                <strong>${Number.isFinite(Number(weather.weather.humidity)) ? `${weather.weather.humidity}%` : "Unavailable"}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">⏱️</span>
                    Pressure
                </span>
                <strong>${Number.isFinite(Number(weather.weather.pressure)) ? `${weather.weather.pressure} hPa` : "Unavailable"}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">💨</span>
                    Wind
                </span>
                <strong>${formatMaybeNumber(weather.weather.windSpeed, 1, " m/s")}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">🌧️</span>
                    Precipitation (1h)
                </span>
                <strong>${formatMaybeNumber(weather.weather.precipitation ?? 0, 1, " mm")}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">☁️</span>
                    Cloudiness
                </span>
                <strong>${Number.isFinite(Number(weather.weather.cloudiness)) ? `${weather.weather.cloudiness}%` : "Unavailable"}</strong>
            </div>
        </div>
    `;

    setClockFromWeather(weather);
}

function renderForecast(weatherMetadata, forecast) {
    window.__climateCurrentWeather = weatherMetadata;
    window.__climateForecastPoint = forecast;

    const countryName = countryNameFromCode(
        weatherMetadata.location.country
    );

    const anomalyText = Number.isFinite(forecast.anomaly)
        ? `${forecast.anomaly >= 0 ? "+" : ""}${forecast.anomaly.toFixed(1)} °C`
        : "Unavailable";

    const precipitationAnomalyText = Number.isFinite(forecast.precipitationAnomaly)
        ? `${forecast.precipitationAnomaly >= 0 ? "+" : ""}${forecast.precipitationAnomaly.toFixed(1)} mm`
        : "Unavailable";

    weatherResult.innerHTML = `
        <div class="weather-country">
            ${countryName}
        </div>

        <h2 class="weather-location">
            ${weatherMetadata.location.name || "Selected location"}
        </h2>

        <div class="forecast-period">
            ${formatMonth(forecast.month)}
        </div>

        <div class="weather-temperature forecast-temperature">
            ${forecast.temperature.toFixed(1)}°
        </div>

        <div class="weather-condition">
            Forecast monthly mean
        </div>
        <div class="weather-source-meta">
            ECMWF SEAS5 ensemble mean · monthly seasonal outlook · ${cacheFreshness(forecast.cache)}
        </div>

        <div class="weather-details forecast-details">
            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">📈</span>
                    Temperature anomaly
                </span>
                <strong>${anomalyText}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">🌧️</span>
                    Precipitation mean
                </span>
                <strong>${Number.isFinite(forecast.precipitation) ? `${forecast.precipitation.toFixed(1)} mm` : "Unavailable"}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">↕️</span>
                    Precipitation anomaly
                </span>
                <strong>${precipitationAnomalyText}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">💨</span>
                    Mean wind
                </span>
                <strong>${Number.isFinite(forecast.windSpeed) ? `${forecast.windSpeed.toFixed(1)} m/s` : "Unavailable"}</strong>
            </div>

            <div class="weather-detail">
                <span class="weather-detail-label">
                    <span class="weather-detail-icon">🛰️</span>
                    Model
                </span>
                <strong>ECMWF SEAS5</strong>
            </div>
        </div>

        <p class="forecast-note">
            Seasonal forecasts describe regional monthly conditions.
            They are not exact day-by-day local predictions.
        </p>
    `;

    setClockFromWeather(weatherMetadata);
}

window.renderWeather = renderWeather;
window.renderForecast = renderForecast;

updateClock();
setInterval(updateClock, 1000);

let searchTimer;
let searchRequestId = 0;

async function searchLocations() {
    const query = searchInput.value.trim();

    if (!query) {
        searchResults.innerHTML = "";
        return;
    }

    const requestId = ++searchRequestId;

    try {
        const response = await fetch(
            `/api/locations/search?q=${encodeURIComponent(query)}`
        );

        if (!response.ok) {
            throw new Error(`Location search failed: ${response.status}`);
        }

        const locations = await response.json();

        if (requestId !== searchRequestId) {
            return;
        }

        searchResults.innerHTML = "";

        locations.forEach((location) => {
            const button = document.createElement("button");
            const parts = [
                location.name,
                location.state,
                location.country
            ].filter(Boolean);

            button.textContent = parts.join(", ");

            button.addEventListener("click", () => {
                searchInput.value = location.name;
                searchResults.innerHTML = "";

                window.selectMapLocation?.(location, {
                    focus: true
                });
            });

            searchResults.appendChild(button);
        });
    } catch (error) {
        console.error(error);
        searchResults.innerHTML = "";
    }
}

searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(
        searchLocations,
        250
    );
});

searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        clearTimeout(searchTimer);
        searchLocations();
    }
});

searchButton.addEventListener("click", searchLocations);

document.addEventListener("click", (event) => {
    if (
        !searchInput.contains(event.target) &&
        !searchResults.contains(event.target) &&
        !searchButton.contains(event.target)
    ) {
        searchResults.innerHTML = "";
    }
});
