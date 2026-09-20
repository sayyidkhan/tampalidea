"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { listProjects, projectRecord, replaceComposition, setup } = require("./database.js");

test("stores a named composition and preserves its audit record in SQLite", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tampalidea-"));
  const db = setup(dir);
  const project = replaceComposition(db, { projectName: "Batam 100", tagline: "A deliberate island week", description: "Test record", actor: "Orin Forgekeeper", reason: "Founder-authorised import", sourceReference: "Owner request", contributors: [{ name: "Sayyid Khan", role: "Founder", ownership: 50 }, { name: "Hisyam", role: "Founder", ownership: 50 }] });
  assert.equal(project.slug, "batam-100");
  assert.equal(project.audit.length, 1);
  assert.equal(project.contributors[0].ownership + project.contributors[1].ownership, 10_000);
  assert.equal(listProjects(db).length, 1);
  assert.equal(projectRecord(db, "batam-100").name, "Batam 100");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
