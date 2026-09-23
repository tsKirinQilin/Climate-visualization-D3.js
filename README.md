# Climate Visualization

A D3.js weather and climate intelligence platform built as a single Node.js / Express application.

### Global interactive map

- Realtime global map with temperature, precipitation and wind-speed metrics; precipitation uses a denser 5° sampling grid with a short server cache for better spatial detail.
- Static realtime cloud-cover layer.
- Animated D3/SVG wind particles with interpolated wind vectors.
- Forecast mode based on ECMWF SEAS5 ensemble-mean seasonal data.
- Monthly temperature, precipitation and wind layers in Forecast mode.
- Zoom-dependent Natural Earth city labels.
- Search, map selection, country hover and local-time display.
- URL state for mode, metric, selected month and coordinates.

### Location analytics

Selecting a location opens additional D3 analytics:

- next 24 hours temperature chart;
- 7-day min/max temperature overview;
- precipitation probability and wind information;
- full seasonal monthly temperature + anomaly profile;
- selected-month precipitation and wind values.

### Compare mode

1. Select a first location.
2. Press **Compare**.
3. Search for or click a second location.

Realtime comparison plots the 7-day temperature outlook. Forecast comparison plots the seasonal monthly temperature profiles.

### Climate AI

Climate AI uses Gemini function calling. The model does not receive permission to invent weather values. It can request deterministic backend tools for:

- current weather;
- 24-hour / 7-day forecast;
- seasonal outlook;
- historical month statistics;
- comparison of two months;
- comparison of two locations;
- multi-year same-month temperature history.

Historical data comes from Open-Meteo's Historical Weather API. Arithmetic comparisons are calculated in the backend services before Gemini explains the result.

When a tool returns time-series data, the frontend can render a D3 chart below the AI response.

## Data sources

- **OpenWeather** — detailed current conditions for the selected point.
- **Open-Meteo Forecast API** — realtime global grid and short-range analytics.
- **Open-Meteo Historical Weather API** — historical comparisons used by Climate AI.
- **ECMWF SEAS5 via Open-Meteo Seasonal API** — monthly seasonal outlooks and anomalies.
- **Natural Earth / world-atlas** — world boundaries and populated places.
- **Gemini API** — natural-language interpretation and tool orchestration only.

Seasonal values are broad regional monthly forecasts. They are not exact day-by-day local predictions. Temperature anomaly is measured against the model climatology, not against the previous year.

## Local run

1. Install Node.js 20+.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env` from `.env.example`:

   ```env
   OPENWEATHER_API_KEY=your_openweather_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3.8-flash
   ```

   `GEMINI_API_KEY` is only required for Climate AI. The rest of the application works without it.

4. Start the app:

   ```bash
   npm start
   ```

5. Open:

   ```text
   http://localhost:3000
   ```

## Main API routes

```text
GET  /api/health
GET  /api/weather/current
GET  /api/locations/search
GET  /api/temperature-map
GET  /api/forecast/seasonal
GET  /api/analytics/location
GET  /api/analytics/seasonal-profile
GET  /api/analytics/compare
GET  /api/ai/status
POST /api/ai/chat
```

## Architecture

```text
client/
  D3 map + charts + analytics + AI UI

server/routes/
  HTTP endpoints

server/controllers/
  validation and HTTP response handling

server/services/
  weather analytics, comparison logic, AI orchestration

server/providers/
  external OpenWeather / Open-Meteo calls
```

Climate AI calls the same service layer as the normal application rather than directly constructing arbitrary external API URLs.

## Deployment

https://climate-visualization-d3-js.onrender.com

```text
OPENWEATHER_API_KEY
GEMINI_API_KEY
GEMINI_MODEL=gemini-3.8-flash
```
