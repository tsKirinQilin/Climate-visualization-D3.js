const aiForm = document.getElementById("ai-form");
const aiInput = document.getElementById("ai-input");
const aiSendButton = document.getElementById("ai-send-button");
const aiChat = document.getElementById("ai-chat");
const aiChart = document.getElementById("ai-chart");
const aiSources = document.getElementById("ai-sources");
const aiStatus = document.getElementById("ai-status");
const aiSuggestions = document.getElementById("ai-suggestions");

const aiHistory = [];
let aiRequestInFlight = false;

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

function contextAwarePrompt(prompt) {
    const context = currentContext();

    if (prompt.includes("selected forecast") && context.selectedMonth) {
        return `Explain the temperature anomaly for the selected location in ${context.selectedMonth}.`;
    }

    if (prompt.includes("selected month") && context.selectedMonth) {
        return `Compare the selected location in ${context.selectedMonth} with the same calendar month one year earlier.`;
    }

    if (prompt.includes("this calendar month") && context.selectedMonth) {
        const monthNumber = Number(context.selectedMonth.split("-")[1]);
        return `Show the temperature trend for calendar month ${monthNumber} at the selected location over the last 10 complete years.`;
    }

    return prompt;
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

        placeholder.textContent = data.reply || "No response.";
        aiHistory.push({
            role: "assistant",
            text: data.reply || "No response."
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
    const button = event.target.closest("button[data-prompt]");

    if (!button) {
        return;
    }

    sendAiMessage(contextAwarePrompt(button.dataset.prompt));
});

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

loadAiStatus();
