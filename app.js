(() => {
  const base = window.location.pathname.replace(/\/$/, "");
  const slug = base.split("/").filter(Boolean).at(-1);
  const isProject = base !== "" && !base.endsWith("tampalidea");
  const api = (suffix) => `${base || ""}/api${suffix}`;
  const escape = (value) => String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const format = (units) => `${(Number(units) / 100).toFixed(2).replace(/\.00$/, "")}%`;
  function imageUrl(id) { return `${base || ""}/media/${id}`; }
  function projectCard(project) {
    const image = project.attachments?.[0];
    return `<a class="project-card" href="${base || ""}/${project.slug}"><span class="project-number">${String(project.contributors.length).padStart(2, "0")} PEOPLE</span>${image ? `<img src="${imageUrl(image.id)}" alt="${escape(image.altText || project.name)}">` : `<span class="project-graphic"></span>`}<span><strong>${escape(project.name)}</strong><small>${escape(project.tagline || "Founder composition & project story")}</small></span><b>↗</b></a>`;
  }
  function renderDetail(project) {
    document.title = `${project.name} — TampalIdea`;
    document.querySelector("#hero .kicker").textContent = "Project dossier";
    document.querySelector("#hero h1").innerHTML = `${escape(project.name).replace(/ /g, "<br>")}`;
    document.querySelector("#hero .lede").textContent = project.description || project.tagline || "A private record for this project’s people and direction.";
    document.querySelector("#hero-action").textContent = "See project record ↓";
    document.querySelector("#hero-action").href = "#project-detail";
    const gallery = project.attachments.map((asset) => `<figure><img src="${imageUrl(asset.id)}" alt="${escape(asset.altText || asset.filename)}"><figcaption>${escape(asset.altText || asset.filename)}</figcaption></figure>`).join("") || '<p class="loading">No visual references attached yet.</p>';
    const people = project.contributors.map((person) => `<li><span>${escape(person.name)}<small>${escape(person.role)}</small></span><b>${format(person.ownership)}</b></li>`).join("");
    const updates = project.audit.slice().reverse().map((event) => `<li><b>${escape(event.actor)}</b><span>${escape(event.reason)} · ${new Date(event.timestamp).toLocaleDateString()}</span></li>`).join("");
    document.querySelector("#project-detail").innerHTML = `<div class="project-header"><p class="kicker">${escape(project.tagline || "Project brief")}</p><h2>The project record</h2><p>Updated ${new Date(project.updatedAt).toLocaleDateString()}</p></div><div class="gallery">${gallery}</div><div class="ledger"><section><p class="kicker">Composition</p><h3>People behind it</h3><ul>${people}</ul></section><section><p class="kicker">Audit trail</p><h3>Recorded decisions</h3><ul class="updates">${updates || "<li><span>No updates yet.</span></li>"}</ul></section></div>`;
    document.querySelector("#project-detail").hidden = false;
  }
  async function start() {
    try {
      if (isProject) {
        const response = await fetch(api(`/projects/${slug}`), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Project unavailable");
        renderDetail((await response.json()).project);
        document.querySelector("#project-list").hidden = true;
      } else {
        const response = await fetch(api("/projects"), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Ledger unavailable");
        const projects = (await response.json()).projects;
        document.querySelector("#project-list").innerHTML = projects.length ? projects.map(projectCard).join("") : '<p class="loading">No projects have been recorded yet.</p>';
      }
    } catch (_) { document.querySelector("#project-list").innerHTML = '<p class="loading">The private project ledger is temporarily unavailable.</p>'; }
  }
  start();
})();
