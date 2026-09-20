#!/usr/bin/env node
"use strict";

const http = require("node:http");

if (process.argv.length !== 2) {
  process.stderr.write("Usage: provide one composition JSON object via stdin.\n");
  process.exit(2);
}
const token = process.env.TAMPALIDEA_ADMIN_TOKEN;
if (!token) {
  process.stderr.write("TAMPALIDEA_ADMIN_TOKEN is not configured.\n");
  process.exit(2);
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; if (input.length > 64_000) process.exit(2); });
process.stdin.on("end", () => {
  let body;
  try { body = JSON.parse(input); } catch (_) { process.stderr.write("Input must be valid JSON.\n"); process.exit(2); }
  const request = http.request({
    host: "127.0.0.1",
    port: Number(process.env.TAMPALIDEA_PORT || 8808),
    path: "/api/projects/composition",
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(JSON.stringify(body)) },
  }, (response) => {
    let output = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { output += chunk; });
    response.on("end", () => {
      process.stdout.write(`${output}\n`);
      process.exit(response.statusCode >= 200 && response.statusCode < 300 ? 0 : 1);
    });
  });
  request.on("error", (error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
  request.end(JSON.stringify(body));
});
