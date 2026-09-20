"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createMemory, deleteMemory, importLegacy, listMemories, listProjects, projectRecord, replaceComposition, replaceDetails, setup, updateMemory } = require("./database.js");

const root = __dirname;
const port = Number(process.env.PORT || 8808);
const dataDir = path.resolve(process.env.TAMPALIDEA_DATA_DIR || path.join(root, ".data"));
const mediaDir = path.join(dataDir, "media");
const db = setup(dataDir);
importLegacy(db, dataDir);
fs.mkdirSync(mediaDir, { recursive: true, mode: 0o700 });
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]], ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "application/javascript; charset=utf-8"]], ["/ownership.js", ["ownership.js", "application/javascript; charset=utf-8"]], ["/styles.css", ["styles.css", "text/css; charset=utf-8"]], ["/detail.css", ["detail.css", "text/css; charset=utf-8"]]
]);

function json(response, status, body) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }); response.end(JSON.stringify(body)); }
function page(response) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
    .replace('<link rel="stylesheet" href="styles.css">', `<style>${fs.readFileSync(path.join(root, "styles.css"), "utf8")}</style>`)
    .replace('<link rel="stylesheet" href="detail.css">', `<style>${fs.readFileSync(path.join(root, "detail.css"), "utf8")}</style>`)
    .replace('<script src="app.js"></script>', `<script>${fs.readFileSync(path.join(root, "app.js"), "utf8")}</script>`);
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  response.end(html);
}
function authorised(request) {
  const source = request.socket.remoteAddress || "";
  const local = source === "127.0.0.1" || source === "::1" || source === "::ffff:127.0.0.1";
  return local && request.headers["x-zo-gateway-access"] !== "public";
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
  const timestamp = new Date().toISOString();
  const priorCover = project.attachments.find((asset) => asset.isCover);
  const isCover = Boolean(input.cover) || !priorCover;
  const reason = String(input.reason || "Founder-authorised image attachment").trim().slice(0, 200);
  const sourceReference = String(input.sourceReference || "Attachment API").trim().slice(0, 240);
  const filePath = path.join(mediaDir, storageKey);
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  try {
    db.exec("BEGIN IMMEDIATE");
    if (isCover) db.prepare("UPDATE attachments SET is_cover = 0 WHERE project_id = ?").run(project.id);
    db.prepare("INSERT INTO attachments (id, project_id, filename, mime_type, bytes, storage_key, alt_text, actor, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, project.id, filename, mimeType, bytes.length, storageKey, altText, actor, Number(isCover), timestamp);
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, project.id);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'attachment.added', ?, ?, ?, ?, ?, ?)")
      .run(project.id, actor, reason || "Founder-authorised image attachment", sourceReference || "Attachment API", JSON.stringify({ coverAttachmentId: priorCover?.id || null }), JSON.stringify({ attachmentId: id, coverAttachmentId: isCover ? id : priorCover?.id || null }), timestamp);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    fs.rmSync(filePath, { force: true });
    throw error;
  }
  return { id, filename, mimeType, bytes: bytes.length, altText, isCover };
}

function selectCover(project, attachmentId, input) {
  const attachment = db.prepare("SELECT id FROM attachments WHERE id = ? AND project_id = ?").get(attachmentId, project.id);
  if (!attachment) throw new Error("Image not found for this project.");
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "Founder-authorised cover selection").trim().slice(0, 200);
  const sourceReference = String(input.sourceReference || "Attachment API").trim().slice(0, 240);
  if (!actor || !reason || !sourceReference || actor.length > 100) throw new Error("actor, reason and sourceReference are required.");
  const priorCover = project.attachments.find((asset) => asset.isCover);
  const timestamp = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE attachments SET is_cover = 0 WHERE project_id = ?").run(project.id);
    db.prepare("UPDATE attachments SET is_cover = 1 WHERE id = ? AND project_id = ?").run(attachmentId, project.id);
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, project.id);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'attachment.cover.selected', ?, ?, ?, ?, ?, ?)")
      .run(project.id, actor, reason, sourceReference, JSON.stringify({ coverAttachmentId: priorCover?.id || null }), JSON.stringify({ coverAttachmentId: attachmentId }), timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return projectRecord(db, project.slug);
}

function updateAttachment(project, attachmentId, input) {
  const prior = project.attachments.find((asset) => asset.id === attachmentId);
  if (!prior) throw new Error("Image not found for this project.");
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  const sourceReference = String(input.sourceReference || "").trim();
  const hasAltText = Object.hasOwn(input, "altText");
  const hasCover = Object.hasOwn(input, "cover");
  const altText = hasAltText ? String(input.altText || "").trim().slice(0, 240) : prior.altText;
  if (!actor || !reason || !sourceReference || (!hasAltText && !hasCover)) throw new Error("actor, reason, sourceReference and an image change are required.");
  if (actor.length > 100 || reason.length > 200 || sourceReference.length > 240 || (hasCover && typeof input.cover !== "boolean")) throw new Error("One or more fields are invalid.");
  const timestamp = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (input.cover === true) db.prepare("UPDATE attachments SET is_cover = 0 WHERE project_id = ?").run(project.id);
    db.prepare("UPDATE attachments SET alt_text = ?, is_cover = ? WHERE id = ? AND project_id = ?").run(altText, Number(input.cover === true || prior.isCover), attachmentId, project.id);
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, project.id);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'attachment.updated', ?, ?, ?, ?, ?, ?)")
      .run(project.id, actor, reason, sourceReference, JSON.stringify(prior), JSON.stringify({ attachmentId, altText, isCover: input.cover === true || (!hasCover && Boolean(prior.isCover)) }), timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return projectRecord(db, project.slug);
}

function deleteAttachment(project, attachmentId, input) {
  const prior = project.attachments.find((asset) => asset.id === attachmentId);
  if (!prior) throw new Error("Image not found for this project.");
  const stored = db.prepare("SELECT storage_key FROM attachments WHERE id = ? AND project_id = ?").get(attachmentId, project.id);
  if (!stored) throw new Error("Image file record not found for this project.");
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  const sourceReference = String(input.sourceReference || "").trim();
  if (!actor || !reason || !sourceReference || actor.length > 100 || reason.length > 200 || sourceReference.length > 240) throw new Error("actor, reason and sourceReference are required.");
  const timestamp = new Date().toISOString();
  let nextCover = null;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM attachments WHERE id = ? AND project_id = ?").run(attachmentId, project.id);
    if (prior.isCover) {
      nextCover = db.prepare("SELECT id FROM attachments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(project.id)?.id || null;
      if (nextCover) db.prepare("UPDATE attachments SET is_cover = 1 WHERE id = ?").run(nextCover);
    }
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, project.id);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'attachment.deleted', ?, ?, ?, ?, ?, ?)")
      .run(project.id, actor, reason, sourceReference, JSON.stringify(prior), JSON.stringify({ deletedAttachmentId: attachmentId, coverAttachmentId: nextCover }), timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  fs.rmSync(path.join(mediaDir, stored.storage_key), { force: true });
  return projectRecord(db, project.slug);
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  try {
    if (request.method === "GET" && pathname === "/api/health") return json(response, 200, { status: "ok", storage: "sqlite" });
    if (request.method === "GET" && pathname === "/api/projects") return json(response, 200, { projects: listProjects(db) });
    const projectMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
    if (request.method === "GET" && projectMatch) { const project = projectRecord(db, projectMatch[1]); return project ? json(response, 200, { project }) : json(response, 404, { error: "Project not found." }); }
    const memoryCollectionMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/memories$/);
    if ((request.method === "GET" || request.method === "POST") && memoryCollectionMatch) {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorised." });
      if (request.method === "GET") return json(response, 200, { memories: listMemories(db, memoryCollectionMatch[1]) });
      return json(response, 201, { ok: true, memory: createMemory(db, memoryCollectionMatch[1], await parseBody(request)) });
    }
    const memoryMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/memories\/([0-9a-f-]{36})$/);
    if ((request.method === "PATCH" || request.method === "DELETE") && memoryMatch) {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorised." });
      const input = await parseBody(request);
      const result = request.method === "PATCH" ? updateMemory(db, memoryMatch[1], memoryMatch[2], input) : deleteMemory(db, memoryMatch[1], memoryMatch[2], input);
      return json(response, 200, { ok: true, memory: result });
    }
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
    const coverMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/attachments\/([0-9a-f-]{36})\/cover$/);
    if (request.method === "POST" && coverMatch) {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorised." });
      const project = projectRecord(db, coverMatch[1]);
      if (!project) return json(response, 404, { error: "Project not found." });
      return json(response, 200, { ok: true, project: selectCover(project, coverMatch[2], await parseBody(request)) });
    }
    const attachmentMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/attachments\/([0-9a-f-]{36})$/);
    if ((request.method === "PATCH" || request.method === "DELETE") && attachmentMatch) {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorised." });
      const project = projectRecord(db, attachmentMatch[1]);
      if (!project) return json(response, 404, { error: "Project not found." });
      const input = await parseBody(request);
      return json(response, 200, { ok: true, project: request.method === "PATCH" ? updateAttachment(project, attachmentMatch[2], input) : deleteAttachment(project, attachmentMatch[2], input) });
    }
    const mediaMatch = pathname.match(/^\/media\/([0-9a-f-]{36})$/);
    if (request.method === "GET" && mediaMatch) {
      const record = db.prepare("SELECT mime_type, storage_key FROM attachments WHERE id = ?").get(mediaMatch[1]);
      if (!record) return json(response, 404, { error: "Image not found." });
      response.writeHead(200, { "Content-Type": record.mime_type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" });
      return fs.createReadStream(path.join(mediaDir, record.storage_key)).pipe(response);
    }
    const assetPath = pathname.replace(/^\/[a-z0-9-]+\/(app\.js|styles\.css|detail\.css|ownership\.js)$/, "/$1");
    if (request.method === "GET" && (pathname === "/" || pathname === "/index.html")) return page(response);
    if (request.method === "GET" && staticFiles.has(assetPath)) { const [file, type] = staticFiles.get(assetPath); response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache", "X-Robots-Tag": "noindex, nofollow" }); return fs.createReadStream(path.join(root, file)).pipe(response); }
    if (request.method === "GET" && pathname.split("/").filter(Boolean).length === 1 && safeSlug(pathname.slice(1))) return page(response);
    return json(response, 404, { error: "Not found." });
  } catch (error) { return json(response, 400, { error: error.message || "Invalid request." }); }
});
server.listen(port, "127.0.0.1", () => console.log(`TampalIdea SQLite service listening on 127.0.0.1:${port}`));
