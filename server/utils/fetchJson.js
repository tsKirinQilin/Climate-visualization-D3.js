const TEMPORARY_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response, attempt, baseDelayMs) {
    const retryAfter = response?.headers?.get?.("retry-after");
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
    }

    return Math.min(12000, baseDelayMs * 2 ** attempt);
}

function networkErrorCode(error) {
    return (
        error?.cause?.code ||
        error?.code ||
        error?.name ||
        "NETWORK_ERROR"
    );
}

export async function fetchJsonWithRetry(
    url,
    {
        label = "External API request failed",
        fetchOptions = {},
        retries = 3,
        timeoutMs = 20000,
        baseDelayMs = 900,
        retryStatuses = TEMPORARY_STATUSES
    } = {}
) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: AbortSignal.timeout(timeoutMs)
            });

            if (response.ok) {
                return response.json();
            }

            const body = await response.json().catch(() => ({}));
            const message =
                body?.reason ||
                body?.error?.message ||
                body?.error ||
                `${label}: ${response.status}`;

            if (
                !retryStatuses.has(response.status) ||
                attempt === retries
            ) {
                const error = new Error(message);
                error.status = response.status;
                error.code = "UPSTREAM_HTTP_ERROR";
                throw error;
            }

            const delay = retryDelay(
                response,
                attempt,
                baseDelayMs
            );

            console.warn(
                `${label}: HTTP ${response.status}. Retrying in ${delay} ms...`
            );
            await sleep(delay);
        } catch (error) {
            // HTTP errors thrown above should not be reclassified as network errors.
            if (error?.code === "UPSTREAM_HTTP_ERROR") {
                throw error;
            }

            lastError = error;

            if (attempt === retries) {
                const wrapped = new Error(
                    `${label}: network unavailable (${networkErrorCode(error)})`
                );
                wrapped.code = "UPSTREAM_NETWORK_ERROR";
                wrapped.cause = error;
                throw wrapped;
            }

            const delay = Math.min(
                12000,
                baseDelayMs * 2 ** attempt
            );

            console.warn(
                `${label}: ${networkErrorCode(error)}. Retrying in ${delay} ms...`
            );
            await sleep(delay);
        }
    }

    throw lastError || new Error(label);
}
