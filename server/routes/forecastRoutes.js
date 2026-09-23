import express from "express";
import { getSeasonalForecast } from "../controllers/seasonalForecastController.js";

const router = express.Router();

router.get("/seasonal", getSeasonalForecast);

export default router;
