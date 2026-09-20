"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { importLegacy, listProjects, projectRecord, replaceComposition, replaceDetails, setup } = require("./database.js");

const root = __dirname;
const port = Number(process.env.PORT || 8808);
const dataDir = path.resolve(process.env.TAMPALIDEA_DATA_DIR || path.join(root, ".data"));
const mediaDir = path.join(dataDir, "media");
const db = setup(dataDir);
importLegacy(db, dataDir);
fs.mkdirSync(mediaDir, { recursive: true, mode: 0o700 });
const tokens = [process.env.TAMPALIDEA_ADMIN_TOKEN, process.env.TAMPALIDEA_AGENT_TOKEN].filter(Boolean);
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]], ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "application/javascript; charset=utf-8"]], ["/ownership.js", ["ownership.js", "application/javascript; charset=utf-8"]], ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

function json(response, status, body) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }); response.end(JSON.stringify(body)); }
function authorised(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  return tokens.some((token) => { const expected = Buffer.from(token); return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected); });
}
function parseBody(request, limit = 6_500_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; if (body.length > limit) request.destroy(new Error("Request body is too large.")); });
    request.on("end", () => { try { resolve(JSON.parse(body)); } catch (_) { reject(new Error("Request body must be valid JSON.")); } });
    request.on("error", reject);
  });
}
function safeSlug(value) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null; }
function attachment(project, input) {
  const mimeType = String(input.mimeType || "");
  const filename = path.basename(String(input.filename || "upload"));
  const actor = String(input.actor || "").trim();
  const altText = String(input.altText || "").trim().slice(0, 240);
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(mimeType) || !actor || filename.length > 180) throw new Error("A permitted image, filename and actor are required.");
  const bytes = Buffer.from(String(input.dataBase64 || ""), "base64");
  if (!bytes.length || bytes.length > 5_000_000) throw new Error("Images must be between 1 byte and 5 MB.");
  const id = crypto.randomUUID();
  const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }[mimeType];
  const storageKey = `${id}${ext}`;
  fs.writeFileSync(path.join(mediaDir, storageKey), bytes, { mode: 0o600 });
  db.prepare("INSERT INTO attachments (id, project_id, filename, mime_type, bytes, storage_key, alt_text, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, project.id, filename, mimeType, bytes.length, storageKey, altText, actor, new Date().toISOString());
  return { id, filename, mimeType, bytes: bytes.length, altText };
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  try {
    if (request.method === "GET" && pathname === "/api/health") return json(response, 200, { status: "ok", storage: "sqlite" });
    if (request.method === "GET" && pathname === "/api/projects") return json(response, 200, { projects: listProjects(db) });
    const projectMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
    if (request.method === "GET" && projectMatch) { const project = projectRecord(db, projectMatch[1]); return project ? json(response, 200, { project }) : json(response, 404, { error: "Project not found." }); }
    if (request.method === "POST" && pathname === "/api/projects/composition") {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorised." });
      return json(response, 200, { ok: true, project: replaceComposition(db, await parseBody(request)) });
    }
    const detailMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/details$/);
    if (request.method === "POST" && detailMatch) {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorised." });
      return json(response, 200, { ok: true, project: replaceDetails(db, { ...(await parseBody(request)), slug: detailMatch[1] }) });
    }
    const assetMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/attachments$/);
    if (request.method === "POST" && assetMatch) {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorised." });
      const project = projectRecord(db, assetMatch[1]);
      if (!project) return json(response, 404, { error: "Project not found." });
      return json(response, 201, { ok: true, attachment: attachment(project, await parseBody(request)) });
    }
    const mediaMatch = pathname.match(/^\/media\/([0-9a-f-]{36})$/);
    if (request.method === "GET" && mediaMatch) {
      const record = db.prepare("SELECT mime_type, storage_key FROM attachments WHERE id = ?").get(mediaMatch[1]);
      if (!record) return json(response, 404, { error: "Image not found." });
      response.writeHead(200, { "Content-Type": record.mime_type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" });
      return fs.createReadStream(path.join(mediaDir, record.storage_key)).pipe(response);
    }
    const assetPath = pathname.replace(/^\/[a-z0-9-]+\/(app\.js|styles\.css|ownership\.js)$/, "/$1");
    if (request.method === "GET" && staticFiles.has(assetPath)) { const [file, type] = staticFiles.get(assetPath); response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache", "X-Robots-Tag": "noindex, nofollow" }); return fs.createReadStream(path.join(root, file)).pipe(response); }
    if (request.method === "GET" && pathname.split("/").filter(Boolean).length === 1 && safeSlug(pathname.slice(1))) { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "X-Robots-Tag": "noindex, nofollow" }); return fs.createReadStream(path.join(root, "index.html")).pipe(response); }
    return json(response, 404, { error: "Not found." });
  } catch (error) { return json(response, 400, { error: error.message || "Invalid request." }); }
});
server.listen(port, "127.0.0.1", () => console.log(`TampalIdea SQLite service listening on 127.0.0.1:${port}`));
