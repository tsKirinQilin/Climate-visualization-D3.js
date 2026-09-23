import dotenv from "dotenv";
import express from "express";
import path from "path";
import weatherRoutes from "./routes/weatherRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import temperatureMapRoutes from "./routes/temperatureMapRoutes.js";
import forecastRoutes from "./routes/forecastRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";

dotenv.config();

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
