import express from "express";
import { chatWithClimateAi, getClimateAiStatus } from "../controllers/aiController.js";

const router = express.Router();

router.get("/status", getClimateAiStatus);
router.post("/chat", chatWithClimateAi);

export default router;
