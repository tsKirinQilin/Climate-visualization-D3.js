import express from "express";
import { getCurrentWeather, getMapTile } from "../controllers/weatherController.js";

const router = express.Router();

router.get("/current", getCurrentWeather);
router.get("/map-tile/:layer/:z/:x/:y", getMapTile);

export default router;