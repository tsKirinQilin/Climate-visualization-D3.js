import { runClimateAssistant } from "../services/geminiService.js";

export async function chatWithClimateAi(req, res) {
    const message = typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
        return res.status(400).json({
            error: "Message is required"
        });
    }

    try {
        const result = await runClimateAssistant({
            message,
            history: Array.isArray(req.body?.history) ? req.body.history : [],
            context: req.body?.context && typeof req.body.context === "object"
                ? req.body.context
                : {}
        });

        res.json(result);
    } catch (error) {
        console.error(error);

        if (error.code === "AI_NOT_CONFIGURED") {
            return res.status(503).json({
                error: error.message,
                code: error.code
            });
        }

        if (error.code === "AI_TEMPORARILY_UNAVAILABLE") {
            return res.status(503).json({
                error: "Climate AI is temporarily busy. Please try again in a moment.",
                code: error.code
            });
        }

        res.status(502).json({
            error: "Climate AI request failed",
            detail: error.message
        });
    }
}

export function getClimateAiStatus(req, res) {
    res.json({
        configured: Boolean(process.env.GEMINI_API_KEY),
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash"
    });
}
