import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const runtime = path.join(root, "server", "cache", "runtime");
const presentation = path.join(root, "server", "cache", "presentation");

async function copyDirectory(source, destination) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            await copyDirectory(from, to);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            await fs.copyFile(from, to);
        }
    }
}

await copyDirectory(runtime, presentation);
console.log("Runtime cache promoted to server/cache/presentation. Commit that folder to GitHub before the defense.");
