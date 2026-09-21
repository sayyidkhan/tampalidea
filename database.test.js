"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMemory, deleteMemory, groupProjectRecord, listMemories, listProjects, projectRecord, replaceComposition, replaceDetails, setup, updateMemory, updateProjectAccess } = require("./database.js");

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
  const project = replaceDetails(db, { slug: "batam-100", actor: "TampalIdea recovery", reason: "Restored itinerary", sourceReference: "Git history", appUrl: "https://example.com/app", appLabel: "Project app", details: [{ heading: "Day 01", body: "Arrive and ignite" }] });
  assert.deepEqual(project.details, [{ heading: "Day 01", body: "Arrive and ignite" }]);
  assert.equal(project.appUrl, "https://example.com/app");
  assert.equal(project.appLabel, "Project app");
  assert.equal(project.audit.at(-1).eventType, "project.details.replaced");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("keeps one selected cover image per project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tampalidea-"));
  const db = setup(dir);
  const project = replaceComposition(db, { projectName: "Batam 100", actor: "Orin Forgekeeper", reason: "Founder-authorised import", sourceReference: "Owner request", contributors: [{ name: "Sayyid Khan", role: "Founder", ownership: 100 }] });
  db.prepare("INSERT INTO attachments (id, project_id, filename, mime_type, bytes, storage_key, alt_text, actor, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("00000000-0000-4000-8000-000000000001", project.id, "one.jpg", "image/jpeg", 1, "one.jpg", "First", "Orin Forgekeeper", 1, "2026-09-20T00:00:00.000Z");
  assert.throws(() => db.prepare("INSERT INTO attachments (id, project_id, filename, mime_type, bytes, storage_key, alt_text, actor, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("00000000-0000-4000-8000-000000000002", project.id, "two.jpg", "image/jpeg", 1, "two.jpg", "Second", "Orin Forgekeeper", 1, "2026-09-20T00:01:00.000Z"));
  const record = projectRecord(db, "batam-100");
  assert.equal(record.attachments[0].isCover, 1);
  assert.equal(record.attachments[0].filename, "one.jpg");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("keeps private project memories separate and auditably editable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tampalidea-"));
  const db = setup(dir);
  replaceComposition(db, { projectName: "Batam 100", actor: "Orin Forgekeeper", reason: "Founder-authorised import", sourceReference: "Owner request", contributors: [{ name: "Sayyid Khan", role: "Founder", ownership: 100 }] });
  const created = createMemory(db, "batam-100", { actor: "Orin Forgekeeper", reason: "Save founder decision", sourceReference: "Sayyid WhatsApp DM", title: "Travel priority", content: "Keep the trip useful and celebratory.", type: "decision", tags: ["batam", "priority"] });
  assert.equal(listMemories(db, "batam-100").length, 1);
  const updated = updateMemory(db, "batam-100", created.id, { actor: "Orin Forgekeeper", reason: "Clarify founder decision", sourceReference: "Sayyid WhatsApp DM", content: "Keep the trip useful, celebratory and mobile-first." });
  assert.equal(updated.type, "decision");
  assert.match(updated.content, /mobile-first/);
  deleteMemory(db, "batam-100", created.id, { actor: "Orin Forgekeeper", reason: "Remove superseded memory", sourceReference: "Sayyid WhatsApp DM" });
  assert.deepEqual(listMemories(db, "batam-100"), []);
  const audit = projectRecord(db, "batam-100").audit.map((event) => event.eventType);
  assert.deepEqual(audit.slice(-3), ["memory.created", "memory.updated", "memory.deleted"]);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("scopes WhatsApp projects to their creating group and keeps them out of regular listings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tampalidea-"));
  const db = setup(dir);
  const groupId = "120363410715375967@g.us";
  const groupProject = replaceComposition(db, { projectName: "Group Forge", actor: "Orin Forgekeeper", reason: "Group project request", sourceReference: "Prompt Alchemist Labs group", visibilityScope: "whatsapp_group", whatsappGroupId: groupId, contributors: [{ name: "Member", role: "Creator", ownership: 100 }] });
  replaceComposition(db, { projectName: "Founder Ledger", actor: "Orin Forgekeeper", reason: "Founder-authorised import", sourceReference: "Owner request", contributors: [{ name: "Sayyid Khan", role: "Founder", ownership: 100 }] });
  assert.equal(groupProject.visibilityScope, "whatsapp_group");
  assert.equal(groupProject.whatsappGroupId, groupId);
  assert.deepEqual(listProjects(db, { visibilityScope: "regular" }).map((project) => project.slug), ["founder-ledger"]);
  assert.deepEqual(listProjects(db, { whatsappGroupId: groupId }).map((project) => project.slug), ["group-forge"]);
  assert.equal(groupProjectRecord(db, "group-forge", "120363426669111578@g.us"), null);
  assert.equal(groupProjectRecord(db, "group-forge", groupId)?.slug, "group-forge");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("records an explicit visibility reassignment in the audit trail", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tampalidea-"));
  const db = setup(dir);
  replaceComposition(db, { projectName: "Founder Ledger", actor: "Orin Forgekeeper", reason: "Founder-authorised import", sourceReference: "Owner request", contributors: [{ name: "Sayyid Khan", role: "Founder", ownership: 100 }] });
  const project = updateProjectAccess(db, { slug: "founder-ledger", actor: "Sayyid Khan", reason: "Assign project to its group", sourceReference: "Owner request", visibilityScope: "whatsapp_group", whatsappGroupId: "120363410715375967@g.us" });
  assert.equal(project.visibilityScope, "whatsapp_group");
  assert.equal(project.audit.at(-1).eventType, "project.access.updated");
  assert.throws(() => replaceComposition(db, { projectName: "Founder Ledger", actor: "Orin Forgekeeper", reason: "Wrong route", sourceReference: "Owner request", visibilityScope: "regular", contributors: [{ name: "Sayyid Khan", role: "Founder", ownership: 100 }] }), /access update/);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
