"use strict";

const SCALE = 10_000;

function cleanText(value, field, maxLength) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) throw new Error(`${field} must be between 1 and ${maxLength} characters.`);
  return cleaned;
}

function percentageUnits(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error("Each ownership percentage must be between 0 and 100.");
  }
  return Math.round(numeric * 100);
}

function normaliseContributors(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    throw new Error("contributors must contain between 1 and 30 people.");
  }
  const names = new Set();
  const contributors = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Each contributor must be an object.");
    const name = cleanText(item.name, "Contributor name", 100);
    const uniqueName = name.toLocaleLowerCase();
    if (names.has(uniqueName)) throw new Error("Contributor names must be unique.");
    names.add(uniqueName);
    return {
      name,
      role: cleanText(item.role, "Contributor role", 140),
      ownership: percentageUnits(item.ownership),
    };
  });
  if (contributors.reduce((total, person) => total + person.ownership, 0) !== SCALE) {
    throw new Error("Contributor ownership must total exactly 100%.");
  }
  return contributors;
}

function projectId(name) {
  return name.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function replaceComposition(store, input, timestamp = new Date().toISOString()) {
  if (!store || typeof store !== "object" || Array.isArray(store)) throw new Error("Invalid shared composition store.");
  const projectName = cleanText(input.projectName, "Project name", 100);
  const id = projectId(projectName);
  if (!id) throw new Error("Project name must contain letters or numbers.");
  const actor = cleanText(input.actor, "Actor", 100);
  const reason = cleanText(input.reason, "Reason", 200);
  const sourceReference = cleanText(input.sourceReference, "Source reference", 240);
  const contributors = normaliseContributors(input.contributors);
  const projects = store.projects && typeof store.projects === "object" && !Array.isArray(store.projects) ? store.projects : {};
  const previous = projects[id];
  const before = previous ? previous.contributors.map((person) => ({ ...person })) : [];
  const audit = previous?.audit ? [...previous.audit] : [];
  const record = {
    id,
    name: projectName,
    contributors,
    updatedAt: timestamp,
    audit: [...audit, { timestamp, actor, reason, sourceReference, before, after: contributors.map((person) => ({ ...person })) }],
  };
  return { projects: { ...projects, [id]: record } };
}

function publicProjects(store) {
  const projects = store?.projects && typeof store.projects === "object" ? Object.values(store.projects) : [];
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    contributors: project.contributors,
    updatedAt: project.updatedAt,
    audit: project.audit,
  })).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

module.exports = { SCALE, normaliseContributors, projectId, publicProjects, replaceComposition };
