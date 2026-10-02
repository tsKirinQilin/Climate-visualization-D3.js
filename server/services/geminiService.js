import {
    aiFunctionDeclarations,
    executeAiTool
} from "./aiToolService.js";

const DEFAULT_MODEL = "gemini-3.8-flash";
const FALLBACK_MODELS = [
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite"
];
const MAX_TOOL_ROUNDS = 6;

function buildSystemInstruction(context = {}) {
    const currentDate = new Date().toISOString().slice(0, 10);
    const mapContext = {
        locationName: context.locationName ?? null,
        country: context.country ?? null,
        latitude: Number.isFinite(Number(context.latitude))
            ? Number(context.latitude)
            : null,
        longitude: Number.isFinite(Number(context.longitude))
            ? Number(context.longitude)
            : null,
        mapMode: context.mapMode ?? null,
        mapMetric: context.mapMetric ?? null,
        selectedMonth: context.selectedMonth ?? null
    };

    return `You are Climate AI, the assistant inside an interactive weather and climate visualization application.
Current date: ${currentDate}.
Current map context: ${JSON.stringify(mapContext)}.

Rules:
- Reply in the same language as the user's latest message.
- For any quantitative weather, forecast, historical or comparison claim, use the provided functions. Never invent weather numbers.
- The application backend performs calculations. Prefer compare_months or compare_locations instead of doing arithmetic yourself when those functions fit.
- Clearly distinguish current observations, short-range forecasts, historical observations and seasonal forecasts.
- Seasonal ECMWF SEAS5 values describe broad monthly/regional tendencies and are not exact day-by-day local predictions.
- Temperature anomaly means forecast value minus the model's long-term climatology, not necessarily the difference from last year.
- If a requested future month is outside the available seasonal horizon, say so rather than guessing.
- Keep answers concise but explanatory. Mention the data type/source when it helps interpretation.
- You may explain the map itself without tools when the question is conceptual.
- Do not claim the map or AI has data that the tools did not return.`;
}

function historyToContents(history = []) {
    return history
        .slice(-10)
        .filter((item) => item && typeof item.text === "string")
        .map((item) => ({
            role: item.role === "assistant" ? "model" : "user",
            parts: [{ text: item.text.slice(0, 4000) }]
        }));
}

function extractText(content) {
    return (content?.parts ?? [])
        .filter((part) => typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim();
}

function extractFunctionCalls(content) {
    return (content?.parts ?? [])
        .map((part) => part.functionCall)
        .filter(Boolean);
}

function sleep(milliseconds) {
    return new Promise((resolve) =>
        setTimeout(resolve, milliseconds)
    );
}

function retryDelayFromHeader(response, attempt) {
    const retryAfter = response.headers.get("retry-after");

    if (retryAfter) {
        const seconds = Number(retryAfter);

        if (Number.isFinite(seconds) && seconds >= 0) {
            return seconds * 1000;
        }
    }

    return Math.min(8000, 1200 * 2 ** attempt);
}

async function callGemini(contents, context) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        const error = new Error(
            "Climate AI is not configured. Add GEMINI_API_KEY to .env and restart the server."
        );
        error.code = "AI_NOT_CONFIGURED";
        throw error;
    }

    const configuredModel =
        process.env.GEMINI_MODEL || DEFAULT_MODEL;

    const models = [
        configuredModel,
        ...FALLBACK_MODELS
    ].filter(
        (model, index, items) =>
            items.indexOf(model) === index
    );

    const requestBody = JSON.stringify({
        systemInstruction: {
            parts: [{ text: buildSystemInstruction(context) }]
        },
        contents,
        tools: [
            {
                functionDeclarations: aiFunctionDeclarations
            }
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1400
        }
    });

    let lastTemporaryError = null;

    for (const model of models) {
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/` +
            `${encodeURIComponent(model)}:generateContent`;

        const maxRetries = 2;

        for (
            let attempt = 0;
            attempt <= maxRetries;
            attempt += 1
        ) {
            let response;
            let data = {};

            try {
                response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },
                    body: requestBody,
                    signal: AbortSignal.timeout(25000)
                });

                data = await response.json().catch(() => ({}));
            } catch (error) {
                lastTemporaryError = error;

                if (attempt === maxRetries) {
                    console.warn(
                        `Gemini ${model} network request failed. Trying fallback model if available.`
                    );
                    break;
                }

                const delay = Math.min(
                    6000,
                    1200 * 2 ** attempt
                );

                console.warn(
                    `Gemini ${model} network error. Retrying in ${delay} ms.`
                );
                await sleep(delay);
                continue;
            }

            if (response.ok) {
                const content = data.candidates?.[0]?.content;

                if (!content) {
                    throw new Error(
                        "Gemini returned no response content"
                    );
                }

                return content;
            }

            const isTemporary =
                response.status === 429 ||
                response.status === 500 ||
                response.status === 502 ||
                response.status === 503 ||
                response.status === 504;

            const message =
                data.error?.message ||
                `Gemini API request failed: ${response.status}`;

            if (!isTemporary) {
                const error = new Error(message);
                error.status = response.status;
                error.code = "AI_REQUEST_FAILED";
                throw error;
            }

            lastTemporaryError = new Error(message);
            lastTemporaryError.status = response.status;

            if (attempt === maxRetries) {
                console.warn(
                    `Gemini ${model} remains unavailable (${response.status}). Trying fallback model if available.`
                );
                break;
            }

            const delay = retryDelayFromHeader(
                response,
                attempt
            );

            console.warn(
                `Gemini ${model} temporarily unavailable (${response.status}). Retrying in ${delay} ms.`
            );
            await sleep(delay);
        }
    }

    const error = new Error(
        lastTemporaryError?.message ||
        "Climate AI is temporarily unavailable. Please try again shortly."
    );
    error.status = lastTemporaryError?.status || 503;
    error.code = "AI_TEMPORARILY_UNAVAILABLE";
    throw error;
}

export async function runClimateAssistant({
    message,
    history = [],
    context = {}
}) {
    const contents = [
        ...historyToContents(history),
        {
            role: "user",
            parts: [{ text: message.slice(0, 5000) }]
        }
    ];

    let lastVisualization = null;
    const sources = new Set();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const modelContent = await callGemini(contents, context);
        const functionCalls = extractFunctionCalls(modelContent);

        contents.push(modelContent);

        if (!functionCalls.length) {
            const text = extractText(modelContent);

            return {
                reply: text || "No answer was generated.",
                visualization: lastVisualization,
                sources: [...sources]
            };
        }

        const responseParts = [];

        for (const functionCall of functionCalls) {
            let result;

            try {
                result = await executeAiTool(
                    functionCall.name,
                    functionCall.args ?? {},
                    context
                );

                if (result.visualization) {
                    lastVisualization = result.visualization;
                }

                for (const source of result.sources ?? []) {
                    if (source) {
                        sources.add(source);
                    }
                }
            } catch (error) {
                result = {
                    error: error.message
                };
            }

            const functionResponse = {
                name: functionCall.name,
                response: {
                    result
                }
            };

            if (functionCall.id) {
                functionResponse.id = functionCall.id;
            }

            responseParts.push({ functionResponse });
        }

        contents.push({
            role: "user",
            parts: responseParts
        });
    }

    throw new Error("Climate AI exceeded the maximum tool-call depth");
}
