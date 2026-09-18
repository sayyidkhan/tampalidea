(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TampalIdeaOwnership = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCALE = 10000;

  function formatPercentage(units) {
    return (units / 100).toFixed(2).replace(/\.00$/, "") + "%";
  }

  function parsePercentage(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 100) {
      throw new Error("Ownership must be between 0 and 100.");
    }
    return Math.round(number * 100);
  }

  function allocateOwnership(contributors) {
    const specified = contributors.map((contributor) => parsePercentage(contributor.ownership));
    const unspecified = specified.map((value, index) => (value === null ? index : null)).filter((index) => index !== null);
    const specifiedTotal = specified.reduce((total, value) => total + (value || 0), 0);

    if (!contributors.length) return [];
    if (!unspecified.length) {
      if (specifiedTotal !== SCALE) throw new Error("Ownership must total 100%.");
      return specified;
    }
    if (specifiedTotal > SCALE) throw new Error("Specified ownership cannot exceed 100%.");

    const remainder = SCALE - specifiedTotal;
    const base = Math.floor(remainder / unspecified.length);
    const extra = remainder % unspecified.length;
    return specified.map((value, index) => {
      const position = unspecified.indexOf(index);
      return value === null ? base + (position < extra ? 1 : 0) : value;
    });
  }

  function createAuditEntry({ actor, reason, confirmed, before, after, timestamp = new Date().toISOString() }) {
    return Object.freeze({
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      actor: actor.trim(),
      timestamp,
      before: Object.freeze(before.map((item) => Object.freeze({ ...item }))),
      after: Object.freeze(after.map((item) => Object.freeze({ ...item }))),
      reason: reason.trim(),
      confirmed: Boolean(confirmed),
    });
  }

  return { SCALE, allocateOwnership, createAuditEntry, formatPercentage, parsePercentage };
});
