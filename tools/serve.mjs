// The static server a component's tools and its docs page share while developing. It serves the component's folder,
// with "/" leading to its docs page, so the page's relative links resolve from docs/. In the npm workspace, a
// dependency (Burrowkit, say) sits in the workspace's node_modules, one folder up, where Node finds it, so a path under
// /node_modules/ that the component doesn't have is looked for there too.
//
//   node node_modules/burrowkit/tools/serve.mjs <root> [port]
//
// or, from a tool, createStaticServer(root).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const types = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".map": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".ico": "image/x-icon", ".webp": "image/webp", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm",
    ".woff2": "font/woff2",
};

/** A server (not listening yet) for the folder `root`, with "/" redirecting to `index`. */
export function createStaticServer(root, { index = "/docs/index.html" } = {}) {
    root = resolve(root);
    const shared = join(root, "..", "node_modules");

    return createServer(async (request, response) => {
        const url = new URL(request.url, "http://localhost");

        if (url.pathname === "/") {
            response.writeHead(302, { location: index + url.search }).end();
            return;
        }

        const path = decodeURIComponent(url.pathname);
        const file = join(root, normalize(path.endsWith("/") ? path + "index.html" : path));
        const fallback = join(root, "..", normalize(path));
        if (file !== root && !file.startsWith(root + sep)) {
            response.writeHead(403).end();
            return;
        }

        try {
            const body = await readFile(file).catch(error => {
                if (!fallback.startsWith(shared + sep)) throw error;
                return readFile(fallback);
            });
            response.writeHead(200, {
                "content-type": types[extname(file)] ?? "application/octet-stream",
                "cache-control": "no-store",
            });
            response.end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
}

// From the command line.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = resolve(process.argv[2] ?? ".");
    const port = Number(process.argv[3] ?? 5173);
    createStaticServer(root).listen(port, () => console.log(`serving ${root} on ${port}`));
}