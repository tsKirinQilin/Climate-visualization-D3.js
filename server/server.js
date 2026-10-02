import dotenv from "dotenv";
import dns from "node:dns";
import express from "express";
import path from "path";
import weatherRoutes from "./routes/weatherRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import temperatureMapRoutes from "./routes/temperatureMapRoutes.js";
import forecastRoutes from "./routes/forecastRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import basemapRoutes from "./routes/basemapRoutes.js";

dotenv.config();

// Prefer IPv4 first for outbound API calls. This avoids long connect timeouts
// on networks where IPv6 is advertised but not reliably routed.
dns.setDefaultResultOrder("ipv4first");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));

app.use(
    express.static(
        path.join(import.meta.dirname, "../client")
    )
);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

app.use("/api/weather", weatherRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/temperature-map", temperatureMapRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/basemap", basemapRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
