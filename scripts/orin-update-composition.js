#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { projectId, publicProjects, replaceComposition } = require("../composition.js");

if (process.argv.length !== 2) {
  process.stderr.write("Usage: provide one composition JSON object via stdin.\n");
  process.exit(2);
}
const dataDir = path.resolve(process.env.TAMPALIDEA_DATA_DIR || path.join(__dirname, "..", ".data"));
const dataFile = path.join(dataDir, "shared-compositions.json");

function readStore() {
  try { return JSON.parse(fs.readFileSync(dataFile, "utf8")); }
  catch (error) {
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
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; if (input.length > 64_000) process.exit(2); });
process.stdin.on("end", () => {
  let body;
  try { body = JSON.parse(input); } catch (_) { process.stderr.write("Input must be valid JSON.\n"); process.exit(2); }
  try {
    const next = replaceComposition(readStore(), body);
    writeStore(next);
    const project = publicProjects(next).find((item) => item.id === projectId(body.projectName));
    process.stdout.write(`${JSON.stringify({ ok: true, project })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
});
