#!/usr/bin/env node
"use strict";

const endpoint = (process.env.TAMPALIDEA_API_URL || "http://127.0.0.1:8808").replace(/\/$/, "");
const token = process.env.TAMPALIDEA_AGENT_TOKEN;
if (!token) { process.stderr.write("TAMPALIDEA_AGENT_TOKEN is required.\n"); process.exit(2); }
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; if (input.length > 6_500_000) process.exit(2); });
process.stdin.on("end", async () => {
  try {
    const body = JSON.parse(input);
    const slug = String(body.slug || "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("A valid project slug is required.");
    const response = await fetch(`${endpoint}/api/projects/${slug}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "TampalIdea rejected the image.");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) { process.stderr.write(`${error.message || "Invalid request."}\n`); process.exit(1); }
});
