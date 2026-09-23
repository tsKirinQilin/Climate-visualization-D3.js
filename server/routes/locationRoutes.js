import express from "express";
import { searchLocations } from "../controllers/locationController.js";

const router = express.Router();

router.get("/search", searchLocations);

export default router;