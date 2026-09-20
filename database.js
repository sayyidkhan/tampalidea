"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { normaliseContributors, projectId } = require("./composition.js");

function now() { return new Date().toISOString(); }

function setup(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, "tampalidea.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      tagline TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS contributors (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL, role TEXT NOT NULL, ownership INTEGER NOT NULL,
      PRIMARY KEY (project_id, name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL,
      source_reference TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, mime_type TEXT NOT NULL, bytes INTEGER NOT NULL,
      storage_key TEXT NOT NULL UNIQUE, alt_text TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL,
      is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT;
  `);
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all();
  if (!projectColumns.some(({ name }) => name === "details_json")) {
    db.exec("ALTER TABLE projects ADD COLUMN details_json TEXT NOT NULL DEFAULT '[]'");
  }
  const attachmentColumns = db.prepare("PRAGMA table_info(attachments)").all();
  if (!attachmentColumns.some(({ name }) => name === "is_cover")) {
    db.exec("ALTER TABLE attachments ADD COLUMN is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1))");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_cover_per_project ON attachments(project_id) WHERE is_cover = 1");
  return db;
}

function rows(db, sql, ...values) { return db.prepare(sql).all(...values); }

function projectRecord(db, slug) {
  const project = db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug);
  if (!project) return null;
  const contributors = rows(db, "SELECT name, role, ownership FROM contributors WHERE project_id = ? ORDER BY name COLLATE NOCASE", project.id);
  const audit = rows(db, "SELECT event_type AS eventType, actor, reason, source_reference AS sourceReference, before_json AS beforeJson, after_json AS afterJson, created_at AS timestamp FROM audit_events WHERE project_id = ? ORDER BY id", project.id)
    .map((event) => ({ ...event, before: JSON.parse(event.beforeJson), after: JSON.parse(event.afterJson), beforeJson: undefined, afterJson: undefined }));
  const attachments = rows(db, "SELECT id, filename, mime_type AS mimeType, bytes, alt_text AS altText, is_cover AS isCover, created_at AS createdAt FROM attachments WHERE project_id = ? ORDER BY is_cover DESC, created_at DESC", project.id);
  return { id: project.id, slug: project.slug, name: project.name, tagline: project.tagline, description: project.description, details: JSON.parse(project.details_json || "[]"), createdAt: project.created_at, updatedAt: project.updated_at, contributors, audit, attachments };
}

function listProjects(db) {
  return rows(db, "SELECT slug FROM projects ORDER BY updated_at DESC").map(({ slug }) => projectRecord(db, slug));
}

function replaceComposition(db, input) {
  if (!input || typeof input !== "object") throw new Error("Request body must be an object.");
  const name = String(input.projectName || "").trim();
  const slug = projectId(input.slug || name);
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  const sourceReference = String(input.sourceReference || "").trim();
  if (!name || !slug || !actor || !reason || !sourceReference) throw new Error("projectName, actor, reason and sourceReference are required.");
  if (name.length > 100 || slug.length > 80 || actor.length > 100 || reason.length > 200 || sourceReference.length > 240) throw new Error("One or more fields are too long.");
  const contributors = normaliseContributors(input.contributors);
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const prior = projectRecord(db, slug);
    if (prior) {
      db.prepare("UPDATE projects SET name = ?, tagline = ?, description = ?, updated_at = ? WHERE id = ?").run(name, String(input.tagline || prior.tagline || "").slice(0, 160), String(input.description || prior.description || "").slice(0, 4000), timestamp, prior.id);
    } else {
      db.prepare("INSERT INTO projects (id, name, slug, tagline, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), name, slug, String(input.tagline || "").slice(0, 160), String(input.description || "").slice(0, 4000), timestamp, timestamp);
    }
    const project = db.prepare("SELECT id FROM projects WHERE slug = ?").get(slug);
    db.prepare("DELETE FROM contributors WHERE project_id = ?").run(project.id);
    const insert = db.prepare("INSERT INTO contributors (project_id, name, role, ownership) VALUES (?, ?, ?, ?)");
    for (const person of contributors) insert.run(project.id, person.name, person.role, person.ownership);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'composition.replaced', ?, ?, ?, ?, ?, ?)")
      .run(project.id, actor, reason, sourceReference, JSON.stringify(prior?.contributors || []), JSON.stringify(contributors), timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return projectRecord(db, slug);
}

function replaceDetails(db, input) {
  if (!input || typeof input !== "object") throw new Error("Request body must be an object.");
  const slug = projectId(input.slug || "");
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  const sourceReference = String(input.sourceReference || "").trim();
  const tagline = String(input.tagline || "").trim();
  const description = String(input.description || "").trim();
  if (!slug || !actor || !reason || !sourceReference) throw new Error("slug, actor, reason and sourceReference are required.");
  if (actor.length > 100 || reason.length > 200 || sourceReference.length > 240 || tagline.length > 160 || description.length > 4_000) throw new Error("One or more fields are too long.");
  if (!Array.isArray(input.details) || input.details.length > 12) throw new Error("details must contain up to 12 sections.");
  const details = input.details.map((section) => ({ heading: String(section?.heading || "").trim(), body: String(section?.body || "").trim() }));
  if (details.some(({ heading, body }) => !heading || !body || heading.length > 120 || body.length > 6_000)) throw new Error("Each detail needs a heading and body within the allowed length.");
  const prior = projectRecord(db, slug);
  if (!prior) throw new Error("Project not found.");
  const timestamp = now();
  const before = { tagline: prior.tagline, description: prior.description, details: prior.details };
  const after = { tagline: tagline || prior.tagline, description: description || prior.description, details };
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE projects SET tagline = ?, description = ?, details_json = ?, updated_at = ? WHERE id = ?").run(after.tagline, after.description, JSON.stringify(details), timestamp, prior.id);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'project.details.replaced', ?, ?, ?, ?, ?, ?)")
      .run(prior.id, actor, reason, sourceReference, JSON.stringify(before), JSON.stringify(after), timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return projectRecord(db, slug);
}

function importLegacy(db, dataDir) {
  const legacy = path.join(dataDir, "shared-compositions.json");
  if (!fs.existsSync(legacy) || db.prepare("SELECT COUNT(*) AS count FROM projects").get().count) return;
  const store = JSON.parse(fs.readFileSync(legacy, "utf8"));
  for (const project of Object.values(store.projects || {})) {
    const audit = project.audit?.[project.audit.length - 1];
    if (audit) replaceComposition(db, { projectName: project.name, actor: audit.actor, reason: audit.reason, sourceReference: audit.sourceReference, contributors: project.contributors.map((person) => ({ ...person, ownership: Number(person.ownership) / 100 })) });
  }
}

module.exports = { importLegacy, listProjects, projectRecord, replaceComposition, replaceDetails, setup };
