# Climate Visualization

A D3.js weather and climate intelligence platform built as a single Node.js / Express application.

## Defense build features

### Global interactive map

- Realtime global map with temperature, precipitation and wind-speed metrics. Realtime precipitation uses OpenWeather Weather Maps 1.0 raster tiles so local rain systems are not missed by the coarser point grid used for temperature and wind.
- Static realtime cloud-cover layer.
- Continuous wind-speed field across land and ocean plus animated D3/SVG streamlines driven by interpolated wind vectors.
- Forecast mode based on ECMWF SEAS5 ensemble-mean seasonal data.
- Monthly temperature and wind layers in Forecast mode. Forecast precipitation is visualized as a diverging anomaly map (drier / wetter than the model climatology), while the absolute monthly mean remains available in the detail panel.
- Optional Standard / Satellite basemap switch. Satellite mode uses MapTiler satellite-v2 Web Mercator raster tiles through the Express backend, while D3 weather overlays remain interactive above it.
- Zoom-dependent Natural Earth city labels with collision-aware decluttering.
- Search, map selection, country hover and local-time display.
- URL state for mode, metric, selected month and coordinates.

### Location analytics

Selecting a location opens additional D3 analytics:

- next 24 hours temperature chart;
- 7-day min/max temperature overview;
- precipitation probability and wind information;
- full seasonal monthly temperature + anomaly profile;
- selected-month precipitation mean/anomaly and wind mean/anomaly values.


### Export and transparency

- Export the selected location analytics as CSV.
- Current observations show source freshness information.
- Map fetch/source metadata is shown in the legend area.
- The methodology dialog explains spatial sampling, seasonal anomalies, wind interpolation, AI limits and data-source limitations.
- Climate AI renders basic Markdown safely and shows the data sources used for quantitative answers.
- AI quick actions change with the active Realtime / Forecast context.

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

- **OpenWeather** — detailed current conditions for the selected point and Weather Maps 1.0 precipitation tiles for the Realtime Rain layer.
- **Open-Meteo Forecast API** — realtime global grid and short-range analytics.
- **Open-Meteo Historical Weather API** — historical comparisons used by Climate AI.
- **ECMWF SEAS5 via Open-Meteo Seasonal API** — monthly seasonal outlooks and anomalies.
- **Natural Earth / world-atlas** — world boundaries and populated places.
- **Gemini API** — natural-language interpretation and tool orchestration only.
- **MapTiler Satellite** — optional photographic basemap context; it is not live cloud imagery and does not replace the weather data layers.

Seasonal values are broad regional monthly forecasts. They are not exact day-by-day local predictions. Temperature and precipitation anomalies are measured against the model climatology, not against the previous year. The SEAS5 seasonal data should be interpreted as regional tendencies rather than precise local daily forecasts. Open-Meteo documents SEAS5 at roughly 36 km resolution, with monthly updates around the 5th and no bias correction.

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
   MAPTILER_API_KEY=your_maptiler_api_key_here
   ```

   `GEMINI_API_KEY` is only required for Climate AI. `MAPTILER_API_KEY` is only required for the optional Satellite basemap; Standard mode and all weather analytics continue to work without it.

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
GET  /api/basemap/status
GET  /api/basemap/satellite/:z/:x/:y
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

## Tests

Critical pure backend logic uses Node's built-in test runner. Run:

```bash
npm test
```

The current suite covers the seasonal forecast horizon and adaptive precipitation-grid behavior, including longitude wrapping at the dateline.

## Deployment

The Express server also serves the frontend, so the application can be deployed as one Node web service. Configure environment secrets on the hosting platform:

```text
OPENWEATHER_API_KEY
GEMINI_API_KEY
GEMINI_MODEL=gemini-3.8-flash
MAPTILER_API_KEY
```

The server uses `process.env.PORT` and does not require a database for this checkpoint.

## D3.js motion and interaction

The interface uses D3 not only for drawing charts, but also for data-driven transitions between states:

- map colors interpolate when the metric, forecast month, or realtime/forecast mode changes;
- entering and exiting map samples fade and resize smoothly;
- cloud and wind layers fade between modes; the wind metric combines a D3 colour scale, interpolated scalar field and animated streamlines that remain readable during zoom;
- selected-location markers animate between positions and map zoom uses a smooth D3 zoom transition;
- country and city hover states use D3 transitions;
- line charts animate their initial draw and morph when an existing comparison is updated;
- chart points and bars use staged transitions, including charts returned by Climate AI;
- reduced-motion preferences are respected for accessibility.


## API reliability

The server prefers IPv4 for outbound requests and retries transient network/429/5xx failures with exponential backoff. Global realtime and seasonal map data are cached in memory; if a refresh temporarily fails, the most recent cached map can continue to be served. Climate AI uses Gemini 3.8 Flash by default and can fall back to Gemini 3.7 Flash or Gemini 3.5 Flash-Lite when the primary model is temporarily unavailable.

## Continuous map tooltips

Temperature, precipitation and wind tooltips are calculated from the already-loaded grid in browser memory. Moving the cursor does not create additional API requests. Wind speed/direction and scalar metrics use spatial interpolation between nearby grid points.


### Realtime precipitation tiles

Realtime Rain uses the OpenWeather `precipitation_new` Weather Maps 1.0 layer through a server-side tile proxy, so the OpenWeather API key never reaches the browser. The D3 map uses a Web Mercator projection to align the vector country geometry with the weather raster tiles. Forecast Rain remains an ECMWF SEAS5 monthly precipitation-anomaly visualization.

### Realtime map interaction notes

- **Wind** uses the Open-Meteo realtime vector grid for both the color field and a dense Canvas particle animation. D3 handles the geographic projection, zoom transform, interpolation inputs and cursor coordinate inversion; Canvas is used only for the high-frequency particle drawing.
- **Realtime precipitation** is rendered from OpenWeather `precipitation_new` tiles. The hover tooltip samples the already-loaded tile pixels locally and reports an approximate intensity range, so moving the cursor does not generate extra weather API requests.

### Defense map polish: wrapped Mercator wind map

- Realtime wind now fills the usable Mercator latitude range instead of stopping around ±75°.
- Wind direction in the cursor tooltip is shown with a continuously rotated arrow that follows the particle-flow direction.
- The D3 map renders neighboring wrapped world copies so horizontal panning can continue across the antimeridian without a hard edge.
- Realtime OpenWeather precipitation tiles also wrap horizontally; tile X coordinates are normalized before backend requests.
- Wind particles draw wrapped copies at the dateline so stream trails do not abruptly disappear when crossing ±180°.


## Optional satellite basemap

The **Map / Satellite** switch changes only the geographic background. Satellite mode uses MapTiler `satellite-v2` XYZ tiles in Web Mercator and keeps the D3 temperature, rain, wind, forecast, city, marker and tooltip layers above the imagery. The MapTiler key is read only by the Express backend and is not embedded in client JavaScript.

Create a MapTiler API key and set:

```env
MAPTILER_API_KEY=your_key_here
```

Restart the server after changing the environment. If the key is absent, the Satellite button remains disabled and Standard mode continues to work normally. Satellite imagery is contextual basemap imagery, not a real-time satellite cloud feed.


## Final weather-map rendering

The map now uses a layered Web Mercator renderer inspired by dedicated weather-map interfaces:

- **MAP** uses MapTiler Landscape/terrain raster tiles as a shaded-relief background when `MAPTILER_API_KEY` is configured.
- **SATELLITE** uses the existing MapTiler satellite basemap.
- **Temperature** is rendered as a continuous interpolated raster across land and ocean rather than isolated blurred circles.
- **Realtime rain** remains an OpenWeather precipitation raster overlay.
- **Wind** uses the interpolated wind-speed field plus dense animated Canvas particles.
- Realtime wind particles are also visible at a lower density over Temperature and Rain, similar to dedicated weather-map products.
- D3 vector borders, cities, markers, hover interactions and tooltips stay above the raster layers.

Layer order: `basemap -> weather field -> wind particles -> D3 vector geography -> UI/tooltips`.
