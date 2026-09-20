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
      app_url TEXT NOT NULL DEFAULT '', app_label TEXT NOT NULL DEFAULT '',
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
    CREATE TABLE IF NOT EXISTS project_memories (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL, content TEXT NOT NULL, memory_type TEXT NOT NULL DEFAULT 'note',
      tags_json TEXT NOT NULL DEFAULT '[]', created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS project_memories_by_project ON project_memories(project_id, updated_at DESC);
  `);
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all();
  if (!projectColumns.some(({ name }) => name === "details_json")) {
    db.exec("ALTER TABLE projects ADD COLUMN details_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!projectColumns.some(({ name }) => name === "app_url")) {
    db.exec("ALTER TABLE projects ADD COLUMN app_url TEXT NOT NULL DEFAULT ''");
  }
  if (!projectColumns.some(({ name }) => name === "app_label")) {
    db.exec("ALTER TABLE projects ADD COLUMN app_label TEXT NOT NULL DEFAULT ''");
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
  return { id: project.id, slug: project.slug, name: project.name, tagline: project.tagline, description: project.description, appUrl: project.app_url, appLabel: project.app_label, details: JSON.parse(project.details_json || "[]"), createdAt: project.created_at, updatedAt: project.updated_at, contributors, audit, attachments };
}

function listProjects(db) {
  return rows(db, "SELECT slug FROM projects ORDER BY updated_at DESC").map(({ slug }) => projectRecord(db, slug));
}

function memoryFromRow(memory) {
  return { id: memory.id, title: memory.title, content: memory.content, type: memory.memory_type, tags: JSON.parse(memory.tags_json), createdBy: memory.created_by, updatedBy: memory.updated_by, createdAt: memory.created_at, updatedAt: memory.updated_at };
}

function memoryInput(input, prior = null) {
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  const sourceReference = String(input.sourceReference || "").trim();
  if (!actor || !reason || !sourceReference) throw new Error("actor, reason and sourceReference are required.");
  if (actor.length > 100 || reason.length > 200 || sourceReference.length > 240) throw new Error("One or more fields are too long.");
  const title = input.title === undefined ? prior?.title : String(input.title || "").trim();
  const content = input.content === undefined ? prior?.content : String(input.content || "").trim();
  const type = input.type === undefined ? prior?.type : String(input.type || "note").trim();
  const tags = input.tags === undefined ? prior?.tags || [] : input.tags;
  if (!title || !content || title.length > 160 || content.length > 12_000) throw new Error("title and content are required within the allowed length.");
  if (!new Set(["note", "decision", "fact", "todo", "reference"]).has(type)) throw new Error("type must be note, decision, fact, todo or reference.");
  if (!Array.isArray(tags) || tags.length > 12) throw new Error("tags must contain up to 12 items.");
  const cleanTags = [...new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean))];
  if (cleanTags.some((tag) => tag.length > 48)) throw new Error("Each tag must be at most 48 characters.");
  return { actor, reason, sourceReference, title, content, type, tags: cleanTags };
}

function memoryProject(db, slug) {
  const project = db.prepare("SELECT id, slug FROM projects WHERE slug = ?").get(slug);
  if (!project) throw new Error("Project not found.");
  return project;
}

function listMemories(db, slug) {
  const project = memoryProject(db, slug);
  return rows(db, "SELECT * FROM project_memories WHERE project_id = ? ORDER BY updated_at DESC, id DESC", project.id).map(memoryFromRow);
}

function createMemory(db, slug, input) {
  const project = memoryProject(db, slug);
  const memory = memoryInput(input);
  const timestamp = now();
  const record = { id: crypto.randomUUID(), title: memory.title, content: memory.content, type: memory.type, tags: memory.tags, createdBy: memory.actor, updatedBy: memory.actor, createdAt: timestamp, updatedAt: timestamp };
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO project_memories (id, project_id, title, content, memory_type, tags_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, project.id, record.title, record.content, record.type, JSON.stringify(record.tags), record.createdBy, record.updatedBy, timestamp, timestamp);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'memory.created', ?, ?, ?, ?, ?, ?)").run(project.id, memory.actor, memory.reason, memory.sourceReference, "null", JSON.stringify(record), timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return record;
}

function updateMemory(db, slug, id, input) {
  const project = memoryProject(db, slug);
  const priorRow = db.prepare("SELECT * FROM project_memories WHERE id = ? AND project_id = ?").get(id, project.id);
  if (!priorRow) throw new Error("Project memory not found.");
  const prior = memoryFromRow(priorRow);
  const memory = memoryInput(input, prior);
  if (input.title === undefined && input.content === undefined && input.type === undefined && input.tags === undefined) throw new Error("A memory field to update is required.");
  const timestamp = now();
  const after = { ...prior, title: memory.title, content: memory.content, type: memory.type, tags: memory.tags, updatedBy: memory.actor, updatedAt: timestamp };
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE project_memories SET title = ?, content = ?, memory_type = ?, tags_json = ?, updated_by = ?, updated_at = ? WHERE id = ? AND project_id = ?").run(after.title, after.content, after.type, JSON.stringify(after.tags), after.updatedBy, timestamp, id, project.id);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'memory.updated', ?, ?, ?, ?, ?, ?)").run(project.id, memory.actor, memory.reason, memory.sourceReference, JSON.stringify(prior), JSON.stringify(after), timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return after;
}

function deleteMemory(db, slug, id, input) {
  const project = memoryProject(db, slug);
  const priorRow = db.prepare("SELECT * FROM project_memories WHERE id = ? AND project_id = ?").get(id, project.id);
  if (!priorRow) throw new Error("Project memory not found.");
  const prior = memoryFromRow(priorRow);
  const memory = memoryInput({ ...input, title: prior.title, content: prior.content, type: prior.type, tags: prior.tags }, prior);
  const timestamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM project_memories WHERE id = ? AND project_id = ?").run(id, project.id);
    db.prepare("INSERT INTO audit_events (project_id, event_type, actor, reason, source_reference, before_json, after_json, created_at) VALUES (?, 'memory.deleted', ?, ?, ?, ?, ?, ?)").run(project.id, memory.actor, memory.reason, memory.sourceReference, JSON.stringify(prior), "null", timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return prior;
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
  const prior = projectRecord(db, slug);
  const appUrl = input.appUrl === undefined ? prior?.appUrl || "" : String(input.appUrl || "").trim();
  const appLabel = input.appLabel === undefined ? prior?.appLabel || "" : String(input.appLabel || "").trim();
  if (!slug || !actor || !reason || !sourceReference) throw new Error("slug, actor, reason and sourceReference are required.");
  if (actor.length > 100 || reason.length > 200 || sourceReference.length > 240 || tagline.length > 160 || description.length > 4_000 || appLabel.length > 120 || appUrl.length > 2_000) throw new Error("One or more fields are too long.");
  if (appUrl) {
    let parsed;
    try { parsed = new URL(appUrl); } catch (_) { throw new Error("appUrl must be a valid HTTPS URL."); }
    if (parsed.protocol !== "https:") throw new Error("appUrl must be a valid HTTPS URL.");
  }
  if (!Array.isArray(input.details) || input.details.length > 12) throw new Error("details must contain up to 12 sections.");
  const details = input.details.map((section) => ({ heading: String(section?.heading || "").trim(), body: String(section?.body || "").trim() }));
  if (details.some(({ heading, body }) => !heading || !body || heading.length > 120 || body.length > 6_000)) throw new Error("Each detail needs a heading and body within the allowed length.");
  if (!prior) throw new Error("Project not found.");
  const timestamp = now();
  const before = { tagline: prior.tagline, description: prior.description, appUrl: prior.appUrl, appLabel: prior.appLabel, details: prior.details };
  const after = { tagline: tagline || prior.tagline, description: description || prior.description, appUrl, appLabel, details };
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE projects SET tagline = ?, description = ?, app_url = ?, app_label = ?, details_json = ?, updated_at = ? WHERE id = ?").run(after.tagline, after.description, after.appUrl, after.appLabel, JSON.stringify(details), timestamp, prior.id);
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

module.exports = { createMemory, deleteMemory, importLegacy, listMemories, listProjects, projectRecord, replaceComposition, replaceDetails, setup, updateMemory };
