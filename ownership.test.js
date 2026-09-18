const assert = require("node:assert/strict");
const test = require("node:test");
const { SCALE, allocateOwnership, createAuditEntry, formatPercentage } = require("./ownership.js");

test("omitted ownership splits evenly and assigns remainder hundredths deterministically", () => {
  const allocation = allocateOwnership([{ ownership: "" }, { ownership: "" }, { ownership: "" }]);
  assert.deepEqual(allocation, [3334, 3333, 3333]);
  assert.equal(allocation.reduce((total, value) => total + value, 0), SCALE);
  assert.equal(formatPercentage(allocation[0]), "33.34%");
});

test("specified ownership leaves the remainder evenly to omitted contributors", () => {
  assert.deepEqual(allocateOwnership([{ ownership: "40" }, { ownership: "" }, { ownership: "" }]), [4000, 3000, 3000]);
});

test("fully specified ownership must total exactly 100 percent", () => {
  assert.throws(() => allocateOwnership([{ ownership: "60" }, { ownership: "30" }]), /total 100%/);
});

test("audit records preserve frozen before and after ownership snapshots", () => {
  const entry = createAuditEntry({
    actor: "Aisha", reason: "Initial allocation", confirmed: true,
    before: [], after: [{ id: "one", name: "Aisha", ownership: 10000 }], timestamp: "2026-06-14T10:00:00.000Z",
  });
  assert.equal(entry.actor, "Aisha");
  assert.equal(entry.confirmed, true);
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry.after), true);
  assert.equal(Object.isFrozen(entry.after[0]), true);
  assert.equal(entry.after[0].ownership, 10000);
});
