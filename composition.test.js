"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { publicProjects, replaceComposition } = require("./composition.js");

const update = {
  projectName: "SAJI by Syam",
  actor: "Orin Forgekeeper",
  reason: "Founder-authorised ownership composition update",
  sourceReference: "WhatsApp owner request",
  contributors: [
    { name: "Hisyam", role: "Founder", ownership: 50 },
    { name: "Sayyid Khan", role: "Founder", ownership: 50 },
  ],
};

test("replaces a named composition with an immutable audit entry", () => {
  const first = replaceComposition({ projects: {} }, update, "2026-09-20T00:00:00.000Z");
  const second = replaceComposition(first, { ...update, reason: "Confirmed founder allocation", contributors: [
    { name: "Hisyam", role: "Founder", ownership: 60 },
    { name: "Sayyid Khan", role: "Founder", ownership: 40 },
  ] }, "2026-09-20T01:00:00.000Z");
  const [project] = publicProjects(second);
  assert.equal(project.name, "SAJI by Syam");
  assert.equal(project.contributors[0].ownership, 6000);
  assert.equal(project.audit.length, 2);
  assert.equal(project.audit[1].before[0].ownership, 5000);
});

test("rejects a composition whose ownership does not equal 100 percent", () => {
  assert.throws(() => replaceComposition({ projects: {} }, { ...update, contributors: [
    { name: "Hisyam", role: "Founder", ownership: 50 },
    { name: "Sayyid Khan", role: "Founder", ownership: 40 },
  ] }), /total exactly 100%/);
});

test("rejects duplicate contributors", () => {
  assert.throws(() => replaceComposition({ projects: {} }, { ...update, contributors: [
    { name: "Hisyam", role: "Founder", ownership: 50 },
    { name: "Hisyam", role: "Operator", ownership: 50 },
  ] }), /unique/);
});
