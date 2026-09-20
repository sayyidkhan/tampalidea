#!/usr/bin/env node
"use strict";

const endpoint = (process.env.TAMPALIDEA_API_URL || "http://127.0.0.1:8808").replace(/\/$/, "");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; if (input.length > 64_000) process.exit(2); });
process.stdin.on("end", async () => {
  try {
    const body = JSON.parse(input);
    const slug = String(body.slug || "");
    const attachmentId = String(body.attachmentId || "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[0-9a-f-]{36}$/.test(attachmentId)) throw new Error("A valid project slug and attachmentId are required.");
    const response = await fetch(`${endpoint}/api/projects/${slug}/attachments/${attachmentId}/cover`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "TampalIdea rejected the cover selection.");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) { process.stderr.write(`${error.message || "Invalid request."}\n`); process.exit(1); }
});
