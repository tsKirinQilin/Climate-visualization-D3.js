import express from "express";
import {
    getBasemapStatus,
    getSatelliteBasemapTile,
    getTerrainBasemapTile
} from "../controllers/basemapController.js";

const router = express.Router();

router.get("/status", getBasemapStatus);
router.get("/terrain/:z/:x/:y", getTerrainBasemapTile);
router.get("/satellite/:z/:x/:y", getSatelliteBasemapTile);

export default router;
