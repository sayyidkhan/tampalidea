(() => {
  const { allocateOwnership, createAuditEntry, formatPercentage } = TampalIdeaOwnership;
  const STORAGE_KEY = "tampalidea-project-v1";
  const $ = (id) => document.getElementById(id);
  const form = $("contributor-form");

  let state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.contributors) && Array.isArray(saved.audit)) return saved;
    } catch (_) { /* Start clean if a local browser record is malformed. */ }
    return { name: "Untitled TampalIdea project", contributors: [], audit: [] };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function snapshot(contributors) {
    return contributors.map(({ id, name, role, ownership }) => ({ id, name, role, ownership }));
  }

  function currentContributors() {
    const percentages = allocateOwnership(state.contributors);
    return state.contributors.map((contributor, index) => ({ ...contributor, ownership: percentages[index] }));
  }

  function render() {
    $("project-name").value = state.name;
    const contributors = currentContributors();
    $("contributor-count").textContent = contributors.length;
    $("ownership-total").textContent = contributors.length ? "100%" : "0%";
    $("ownership-status").textContent = contributors.length ? "Complete" : "Add contributors";

    const list = $("contributors");
    list.replaceChildren();
    if (!contributors.length) {
      list.innerHTML = '<p class="empty">No contributors yet. Add the first person to start an ownership record.</p>';
    } else {
      contributors.forEach((contributor) => {
        const entry = $("contributor-template").content.cloneNode(true);
        entry.querySelector("h3").textContent = contributor.name;
        entry.querySelector(".role").textContent = contributor.role;
        entry.querySelector(".percentage").textContent = formatPercentage(contributor.ownership);
        entry.querySelector(".whatsapp").textContent = contributor.whatsappId ? `WhatsApp ID: ${contributor.whatsappId} (consent confirmed)` : "No WhatsApp ID stored";
        list.append(entry);
      });
    }

    const history = $("audit-history");
    history.replaceChildren();
    if (!state.audit.length) {
      history.innerHTML = '<p class="empty">No ownership changes recorded yet.</p>';
      return;
    }
    [...state.audit].reverse().forEach((record) => {
      const article = document.createElement("article");
      article.className = "audit-record";
      const before = record.before.length ? record.before.map((item) => `${item.name}: ${formatPercentage(item.ownership)}`).join(" · ") : "No contributors";
      const after = record.after.map((item) => `${item.name}: ${formatPercentage(item.ownership)}`).join(" · ");
      article.innerHTML = `<div><strong>${escapeHtml(record.reason)}</strong><p>Recorded by ${escapeHtml(record.actor)} · ${new Date(record.timestamp).toLocaleString()}</p></div><span class="badge ${record.confirmed ? "confirmed" : "unconfirmed"}">${record.confirmed ? "Confirmed" : "Unconfirmed"}</span><p><b>Before:</b> ${escapeHtml(before)}<br><b>After:</b> ${escapeHtml(after)}</p>`;
      history.append(article);
    });
  }

  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
  }

  $("save-project").addEventListener("click", () => {
    const name = $("project-name").value.trim();
    if (name) { state.name = name; saveState(); }
    render();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = $("form-error");
    error.textContent = "";
    const whatsappId = $("whatsapp-id").value.trim();
    if (whatsappId && !$("whatsapp-consent").checked) {
      error.textContent = "Confirm consent before storing a WhatsApp ID.";
      return;
    }
    try {
      const before = snapshot(currentContributors());
      const contributor = {
        id: crypto.randomUUID(),
        name: $("full-name").value.trim(),
        role: $("role").value.trim(),
        ownership: $("ownership").value,
        whatsappId,
      };
      const proposed = [...state.contributors, contributor];
      const allocated = allocateOwnership(proposed);
      const after = proposed.map((item, index) => ({ ...item, ownership: allocated[index] }));
      state.contributors = proposed;
      state.audit.push(createAuditEntry({ actor: $("actor").value, reason: $("reason").value, confirmed: $("confirmed").checked, before, after: snapshot(after) }));
      saveState();
      form.reset();
      render();
    } catch (exception) {
      error.textContent = exception.message;
    }
  });

  $("clear-project").addEventListener("click", () => {
    if (!window.confirm("Start a new local project? This removes this browser's saved contributor and audit records.")) return;
    state = { name: "Untitled TampalIdea project", contributors: [], audit: [] };
    saveState();
    render();
  });

  render();
})();
