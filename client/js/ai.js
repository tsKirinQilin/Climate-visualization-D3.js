const aiForm = document.getElementById("ai-form");
const aiInput = document.getElementById("ai-input");
const aiSendButton = document.getElementById("ai-send-button");
const aiChat = document.getElementById("ai-chat");
const aiChart = document.getElementById("ai-chart");
const aiSources = document.getElementById("ai-sources");
const aiStatus = document.getElementById("ai-status");
const aiSuggestions = document.getElementById("ai-suggestions");
const aiContext = document.getElementById("ai-context");
const aiContextMessage = document.getElementById("ai-context-message");

const aiHistory = [];
let aiRequestInFlight = false;

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderSafeMarkdown(text) {
    const lines = String(text ?? "").replace(/\r/g, "").split("\n");
    const html = [];
    let listType = null;

    const closeList = () => {
        if (listType) {
            html.push(`</${listType}>`);
            listType = null;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            closeList();
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            closeList();
            const level = Math.min(5, heading[1].length + 2);
            html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
            continue;
        }

        const bullet = line.match(/^[-*]\s+(.+)$/);
        if (bullet) {
            if (listType !== "ul") {
                closeList();
                listType = "ul";
                html.push("<ul>");
            }
            html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
            continue;
        }

        const numbered = line.match(/^\d+[.)]\s+(.+)$/);
        if (numbered) {
            if (listType !== "ol") {
                closeList();
                listType = "ol";
                html.push("<ol>");
            }
            html.push(`<li>${renderInlineMarkdown(numbered[1])}</li>`);
            continue;
        }

        closeList();
        html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }

    closeList();
    return html.join("");
}

function appendAiMessage(role, text, extraClass = "") {
    const message = document.createElement("div");
    message.className = `ai-message ${role} ${extraClass}`.trim();
    message.textContent = text;
    aiChat.appendChild(message);
    aiChat.scrollTop = aiChat.scrollHeight;
    return message;
}

function setAiBusy(busy) {
    aiRequestInFlight = busy;
    aiInput.disabled = busy;
    aiSendButton.disabled = busy;
    aiSendButton.textContent = busy ? "…" : "Ask";
    aiStatus.textContent = busy ? "Working" : "Gemini";
}

function currentContext() {
    return window.getClimateMapContext?.() ?? {};
}

function formatContextMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
        return month ?? "";
    }

    const [year, monthNumber] = month.split("-").map(Number);
    return new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function buildSuggestionPrompt(action) {
    const context = currentContext();
    const hasLocation = Number.isFinite(context.latitude) && Number.isFinite(context.longitude);

    if (!hasLocation) {
        return "";
    }

    if (context.mapMode === "forecast") {
        if (action === "primary") {
            return `Explain the temperature and precipitation anomalies for the selected location in ${context.selectedMonth}.`;
        }

        if (action === "secondary") {
            return `Compare the selected location in ${context.selectedMonth} with the same calendar month one year earlier.`;
        }

        const monthNumber = Number(context.selectedMonth?.split("-")[1]);
        return `Show the temperature trend for calendar month ${monthNumber} at the selected location over the last 10 complete years.`;
    }

    if (action === "primary") {
        return "Summarize the current weather at the selected location and explain what stands out.";
    }

    if (action === "secondary") {
        return "Summarize the next 7 days at the selected location, including temperature, precipitation and wind.";
    }

    const currentMonth = new Date().getUTCMonth() + 1;
    return `Show the temperature trend for calendar month ${currentMonth} at the selected location over the last 10 complete years.`;
}

function updateAiContextUi() {
    const context = currentContext();
    const hasLocation = Number.isFinite(context.latitude) && Number.isFinite(context.longitude);
    const buttons = [...aiSuggestions.querySelectorAll("button[data-action]")];

    if (!hasLocation) {
        aiContext.textContent = "Context: no location selected";
        buttons.forEach((button) => {
            button.disabled = true;
        });

        if (aiContextMessage && aiHistory.length === 0) {
            aiContextMessage.textContent = "Select a location, then ask a weather or climate question. Quantitative answers use the application's data tools rather than guessed values.";
        }
        return;
    }

    const locationName = context.locationName || `${context.latitude.toFixed(2)}, ${context.longitude.toFixed(2)}`;
    const modeLabel = context.mapMode === "forecast"
        ? `Forecast · ${formatContextMonth(context.selectedMonth)}`
        : "Realtime";

    aiContext.textContent = `Context: ${locationName} · ${modeLabel}`;

    buttons.forEach((button) => {
        button.disabled = false;
    });

    const primary = aiSuggestions.querySelector('[data-action="primary"]');
    const secondary = aiSuggestions.querySelector('[data-action="secondary"]');
    const trend = aiSuggestions.querySelector('[data-action="trend"]');

    if (context.mapMode === "forecast") {
        if (primary) primary.textContent = "Explain anomalies";
        if (secondary) secondary.textContent = "Compare with last year";
        if (trend) trend.textContent = "10-year trend";
    } else {
        if (primary) primary.textContent = "Explain conditions";
        if (secondary) secondary.textContent = "Next 7 days";
        if (trend) trend.textContent = "10-year trend";
    }

    if (aiContextMessage && aiHistory.length === 0) {
        aiContextMessage.textContent = `Using ${locationName} as the active map context. Ask a question or use one of the data-aware actions above.`;
    }
}

async function sendAiMessage(rawMessage) {
    const message = rawMessage.trim();

    if (!message || aiRequestInFlight) {
        return;
    }

    appendAiMessage("user", message);
    aiHistory.push({ role: "user", text: message });
    aiInput.value = "";
    aiChart.hidden = true;
    aiChart.innerHTML = "";
    aiSources.hidden = true;
    aiSources.textContent = "";

    setAiBusy(true);
    const placeholder = appendAiMessage("assistant", "Checking the data…");

    try {
        const response = await fetch("/api/ai/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message,
                history: aiHistory.slice(-9, -1),
                context: currentContext()
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || data.error || `AI request failed: ${response.status}`);
        }

        const reply = data.reply || "No response.";
        placeholder.innerHTML = renderSafeMarkdown(reply);
        placeholder.classList.add("markdown");
        aiHistory.push({
            role: "assistant",
            text: reply
        });

        if (data.visualization && window.renderClimateChart) {
            aiChart.hidden = false;
            window.renderClimateChart(aiChart, data.visualization);
        }

        if (Array.isArray(data.sources) && data.sources.length) {
            aiSources.hidden = false;
            aiSources.textContent = `Data used: ${[...new Set(data.sources)].join(" · ")}`;
        }
    } catch (error) {
        console.error(error);
        placeholder.textContent = error.message;
        placeholder.classList.add("error");

        if (error.message.includes("GEMINI_API_KEY")) {
            aiStatus.textContent = "Setup needed";
        }
    } finally {
        setAiBusy(false);
        aiInput.focus();
    }
}

aiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendAiMessage(aiInput.value);
});

aiInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendAiMessage(aiInput.value);
    }
});

aiSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button || button.disabled) {
        return;
    }

    const prompt = buildSuggestionPrompt(button.dataset.action);
    if (prompt) {
        sendAiMessage(prompt);
    }
});

window.addEventListener("climate:location-selected", updateAiContextUi);

async function loadAiStatus() {
    try {
        const response = await fetch("/api/ai/status");

        if (!response.ok) {
            return;
        }

        const status = await response.json();
        aiStatus.textContent = status.configured ? "Gemini" : "Setup needed";
        aiStatus.title = status.configured
            ? `Model: ${status.model}`
            : "Add GEMINI_API_KEY to .env and restart the server";
    } catch (error) {
        console.error(error);
    }
}

updateAiContextUi();
loadAiStatus();
