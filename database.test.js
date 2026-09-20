"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { listProjects, projectRecord, replaceComposition, replaceDetails, setup } = require("./database.js");

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

test("stores project detail sections with an append-only audit event", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tampalidea-"));
  const db = setup(dir);
  replaceComposition(db, { projectName: "Batam 100", actor: "Orin Forgekeeper", reason: "Founder-authorised import", sourceReference: "Owner request", contributors: [{ name: "Sayyid Khan", role: "Founder", ownership: 100 }] });
  const project = replaceDetails(db, { slug: "batam-100", actor: "TampalIdea recovery", reason: "Restored itinerary", sourceReference: "Git history", details: [{ heading: "Day 01", body: "Arrive and ignite" }] });
  assert.deepEqual(project.details, [{ heading: "Day 01", body: "Arrive and ignite" }]);
  assert.equal(project.audit.at(-1).eventType, "project.details.replaced");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
