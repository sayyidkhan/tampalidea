#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const endpoint = (process.env.TAMPALIDEA_API_URL || "http://127.0.0.1:8808").replace(/\/$/, "");
const token = process.env.TAMPALIDEA_AGENT_TOKEN;
const workspaceRoot = "/home/workspace/";
if (!token) { process.stderr.write("TAMPALIDEA_AGENT_TOKEN is required.\n"); process.exit(2); }

function imageMimeType(file) {
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" })[path.extname(file).toLowerCase()] || "";
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; if (input.length > 6_500_000) process.exit(2); });
process.stdin.on("end", async () => {
  try {
    const payload = JSON.parse(input);
    const action = String(payload.action || "");
    const slug = String(payload.slug || "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("A valid project slug is required.");
    let method = "POST";
    let url = `${endpoint}/api/projects/${slug}/details`;
    if (action === "details.replace") {
      if (!Array.isArray(payload.details)) throw new Error("details.replace requires a details array.");
    } else if (action === "image.add") {
      url = `${endpoint}/api/projects/${slug}/attachments`;
      if (payload.filePath && !payload.dataBase64) {
        const filePath = path.resolve(String(payload.filePath));
        if (!filePath.startsWith(workspaceRoot)) throw new Error("filePath must be inside /home/workspace.");
        const bytes = fs.readFileSync(filePath);
        if (bytes.length > 5_000_000) throw new Error("Images must not exceed 5 MB.");
        payload.dataBase64 = bytes.toString("base64");
        payload.filename ||= path.basename(filePath);
        payload.mimeType ||= imageMimeType(filePath);
      }
    } else if (action === "image.update") {
      const attachmentId = String(payload.attachmentId || "");
      if (!/^[0-9a-f-]{36}$/.test(attachmentId)) throw new Error("image.update requires attachmentId.");
      method = "PATCH";
      url = `${endpoint}/api/projects/${slug}/attachments/${attachmentId}`;
    } else if (action === "image.delete") {
      const attachmentId = String(payload.attachmentId || "");
      if (!/^[0-9a-f-]{36}$/.test(attachmentId)) throw new Error("image.delete requires attachmentId.");
      method = "DELETE";
      url = `${endpoint}/api/projects/${slug}/attachments/${attachmentId}`;
    } else if (action === "image.setCover") {
      const attachmentId = String(payload.attachmentId || "");
      if (!/^[0-9a-f-]{36}$/.test(attachmentId)) throw new Error("image.setCover requires attachmentId.");
      url = `${endpoint}/api/projects/${slug}/attachments/${attachmentId}/cover`;
    } else {
      throw new Error("action must be details.replace, image.add, image.update, image.delete or image.setCover.");
    }
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "TampalIdea rejected the change.");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) { process.stderr.write(`${error.message || "Invalid request."}\n`); process.exit(1); }
});
