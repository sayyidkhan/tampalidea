"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { publicProjects, replaceComposition } = require("./composition.js");

const root = __dirname;
const port = Number(process.env.PORT || 8808);
const dataDir = path.resolve(process.env.TAMPALIDEA_DATA_DIR || path.join(root, ".data"));
const dataFile = path.join(dataDir, "shared-compositions.json");
const token = process.env.TAMPALIDEA_ADMIN_TOKEN || "";
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "application/javascript; charset=utf-8"]],
  ["/ownership.js", ["ownership.js", "application/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { projects: {} };
    throw error;
  }
}

function writeStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, dataFile);
}

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function authorised(request) {
  const header = request.headers.authorization || "";
  if (!token || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) request.destroy();
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body)); } catch (_) { reject(new Error("Request body must be valid JSON.")); }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  try {
    if (request.method === "GET" && pathname === "/api/health") return json(response, 200, { status: "ok" });
    if (request.method === "GET" && pathname === "/api/projects") return json(response, 200, { projects: publicProjects(readStore()) });
    if (request.method === "POST" && pathname === "/api/projects/composition") {
      if (!authorised(request)) return json(response, 401, { error: "Unauthorized." });
      const next = replaceComposition(readStore(), await parseBody(request));
      writeStore(next);
      return json(response, 200, { ok: true, project: publicProjects(next)[0] });
    }
    if (request.method === "GET" && staticFiles.has(pathname)) {
      const [file, contentType] = staticFiles.get(pathname);
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
      return fs.createReadStream(path.join(root, file)).pipe(response);
    }
    return json(response, 404, { error: "Not found." });
  } catch (error) {
    return json(response, 400, { error: error.message || "Invalid request." });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`TampalIdea listening on 127.0.0.1:${port}`));
