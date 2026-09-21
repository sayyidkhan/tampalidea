#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const endpoint = (process.env.TAMPALIDEA_API_URL || "http://127.0.0.1:8808").replace(/\/$/, "");
const workspaceRoot = "/home/workspace/";

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
    if (action !== "project.list" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("A valid project slug is required.");
    let method = "POST";
    let url = `${endpoint}/api/projects/${slug}/details`;
    if (action === "project.list" || action === "project.get") {
      const whatsappGroupId = String(payload.whatsappGroupId || "");
      if (!/^\d{5,32}@g\.us$/.test(whatsappGroupId)) throw new Error(`${action} requires the trusted WhatsApp group ID.`);
      method = "GET";
      url = action === "project.list" ? `${endpoint}/api/agent/projects?whatsappGroupId=${encodeURIComponent(whatsappGroupId)}` : `${endpoint}/api/agent/projects/${slug}?whatsappGroupId=${encodeURIComponent(whatsappGroupId)}`;
    } else if (action === "project.create") {
      if (payload.visibilityScope !== "whatsapp_group") throw new Error("project.create only supports whatsapp_group visibility.");
      if (!/^\d{5,32}@g\.us$/.test(String(payload.whatsappGroupId || ""))) throw new Error("project.create requires the trusted WhatsApp group ID.");
      url = `${endpoint}/api/projects/composition`;
    } else if (action === "access.update") {
      url = `${endpoint}/api/projects/${slug}/access`;
    } else if (action === "details.replace") {
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
    } else if (action === "memory.list") {
      method = "GET";
      url = `${endpoint}/api/projects/${slug}/memories`;
    } else if (action === "memory.create") {
      url = `${endpoint}/api/projects/${slug}/memories`;
    } else if (action === "memory.update" || action === "memory.delete") {
      const memoryId = String(payload.memoryId || "");
      if (!/^[0-9a-f-]{36}$/.test(memoryId)) throw new Error(`${action} requires memoryId.`);
      method = action === "memory.update" ? "PATCH" : "DELETE";
      url = `${endpoint}/api/projects/${slug}/memories/${memoryId}`;
    } else {
      throw new Error("action must be project.list, project.get, project.create, access.update, details.replace, image.add, image.update, image.delete, image.setCover, memory.list, memory.create, memory.update or memory.delete.");
    }
    const options = { method, headers: { "Content-Type": "application/json", Accept: "application/json" } };
    if (method !== "GET") options.body = JSON.stringify(payload);
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "TampalIdea rejected the change.");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) { process.stderr.write(`${error.message || "Invalid request."}\n`); process.exit(1); }
});
