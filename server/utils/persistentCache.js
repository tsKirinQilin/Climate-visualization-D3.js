import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const cacheRoot = path.join(serverRoot, "cache");
const runtimeRoot = path.join(cacheRoot, "runtime");
const presentationRoot = path.join(cacheRoot, "presentation");

const memoryCache = new Map();
const inFlight = new Map();

function safePart(value) {
    return String(value)
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 180);
}

function cacheId(namespace, key) {
    return `${namespace}:${key}`;
}

function filePath(root, namespace, key) {
    return path.join(root, safePart(namespace), `${safePart(key)}.json`);
}

async function readJson(file) {
    try {
        const text = await fs.readFile(file, "utf8");
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

async function readDiskSnapshot(namespace, key) {
    const runtime = await readJson(filePath(runtimeRoot, namespace, key));
    const presentation = await readJson(filePath(presentationRoot, namespace, key));

    if (!runtime) return presentation;
    if (!presentation) return runtime;

    return new Date(runtime.savedAt).getTime() >= new Date(presentation.savedAt).getTime()
        ? runtime
        : presentation;
}

async function writeJson(file, payload) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
}

export async function saveSnapshot(namespace, key, data) {
    const payload = {
        savedAt: new Date().toISOString(),
        data
    };

    memoryCache.set(cacheId(namespace, key), payload);
    await writeJson(filePath(runtimeRoot, namespace, key), payload);

    // During local development, also refresh the Git-trackable presentation cache.
    // On Render/production, runtime writes remain ephemeral and the bundled
    // presentation snapshot stays untouched.
    if (process.env.NODE_ENV !== "production") {
        await writeJson(filePath(presentationRoot, namespace, key), payload);
    }

    return payload;
}

export async function loadSnapshot(namespace, key) {
    const id = cacheId(namespace, key);
    if (memoryCache.has(id)) {
        return memoryCache.get(id);
    }

    const disk = await readDiskSnapshot(namespace, key);
    if (disk) {
        memoryCache.set(id, disk);
    }

    return disk;
}

function ageMs(snapshot) {
    const saved = new Date(snapshot?.savedAt ?? 0).getTime();
    return Number.isFinite(saved) ? Math.max(0, Date.now() - saved) : Infinity;
}

function timeoutResult(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(() => resolve({ kind: "timeout" }), milliseconds);
    });
}

export async function getWithPersistentFallback({
    namespace,
    key,
    ttlMs = 0,
    maxWaitMs = 5000,
    loadFresh
}) {
    const id = cacheId(namespace, key);
    const cached = await loadSnapshot(namespace, key);

    if (cached && ageMs(cached) <= ttlMs) {
        return {
            data: cached.data,
            status: "cache-fresh",
            savedAt: cached.savedAt,
            ageMs: ageMs(cached)
        };
    }

    let request = inFlight.get(id);

    if (!request) {
        request = (async () => {
            const data = await loadFresh();
            const snapshot = await saveSnapshot(namespace, key, data);
            return snapshot;
        })();

        inFlight.set(id, request);
        request.finally(() => {
            if (inFlight.get(id) === request) {
                inFlight.delete(id);
            }
        }).catch(() => {});
    }

    const outcome = await Promise.race([
        request
            .then((snapshot) => ({ kind: "fresh", snapshot }))
            .catch((error) => ({ kind: "error", error })),
        timeoutResult(maxWaitMs)
    ]);

    if (outcome.kind === "fresh") {
        return {
            data: outcome.snapshot.data,
            status: "live",
            savedAt: outcome.snapshot.savedAt,
            ageMs: 0
        };
    }

    if (cached) {
        return {
            data: cached.data,
            status: outcome.kind === "timeout" ? "cache-timeout" : "cache-error",
            savedAt: cached.savedAt,
            ageMs: ageMs(cached),
            upstreamError: outcome.error?.message ?? null
        };
    }

    if (outcome.kind === "error") {
        throw outcome.error;
    }

    const error = new Error(`No cached ${namespace} data is available after ${maxWaitMs} ms`);
    error.code = "CACHE_MISS_TIMEOUT";
    throw error;
}

export function quantizedCoordinateKey(latitude, longitude, precision = 1) {
    const factor = 10 ** precision;
    const lat = Math.round(Number(latitude) * factor) / factor;
    const lon = Math.round(Number(longitude) * factor) / factor;
    return `${lat.toFixed(precision)}_${lon.toFixed(precision)}`;
}
