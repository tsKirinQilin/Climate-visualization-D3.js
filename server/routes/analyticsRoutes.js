import express from "express";
import {
    compareLocationsController,
    getLocationAnalyticsController,
    getSeasonalProfileController
} from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/location", getLocationAnalyticsController);
router.get("/seasonal-profile", getSeasonalProfileController);
router.get("/compare", compareLocationsController);

export default router;
