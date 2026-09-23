import express from "express";
import { getTemperatureMap } from "../controllers/temperatureMapController.js";

const router = express.Router();

router.get("/", getTemperatureMap);

export default router;