(() => {
  const pathname = window.location.pathname.replace(/\/$/, "");
  const pathParts = pathname.split("/").filter(Boolean);
  const isProject = pathParts.at(-1) !== "tampalidea";
  const slug = isProject ? pathParts.at(-1) : null;
  const base = `/${(isProject ? pathParts.slice(0, -1) : pathParts).join("/")}`.replace(/\/$/, "");
  const api = (suffix) => `${base}/api${suffix}`;
  const escape = (value) => String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const format = (units) => `${(Number(units) / 100).toFixed(2).replace(/\.00$/, "")}%`;
  function imageUrl(id) { return `${base || ""}/media/${id}`; }
  function ownershipChart(contributors) {
    const colours = ["#ee6a3c", "#d4ec68", "#13251c", "#8e9d91", "#b4a7d6", "#e6b566"];
    const total = contributors.reduce((sum, person) => sum + Number(person.ownership || 0), 0) || 1;
    const circumference = 339.292;
    let offset = 0;
    const slices = contributors.map((person, index) => {
      const length = circumference * Number(person.ownership || 0) / total;
      const circle = `<circle cx="70" cy="70" r="54" fill="none" stroke="${colours[index % colours.length]}" stroke-width="20" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
      offset += length;
      return circle;
    }).join("");
    const legend = contributors.map((person, index) => `<li><i style="background:${colours[index % colours.length]}"></i><span>${escape(person.name)}</span><b>${format(person.ownership)}</b></li>`).join("");
    return `<div class="ownership-chart"><svg viewBox="0 0 140 140" role="img" aria-label="Ownership distribution"><circle cx="70" cy="70" r="54" fill="none" stroke="#ddd8c8" stroke-width="20"/>${slices}<text x="70" y="66" text-anchor="middle">OWNERSHIP</text><text x="70" y="84" text-anchor="middle">100%</text></svg><ul>${legend}</ul></div>`;
  }
  function projectCard(project) {
    const image = project.attachments?.[0];
    return `<a class="project-card" href="${base}/${project.slug}"><span class="project-number">${String(project.contributors.length).padStart(2, "0")} PEOPLE</span>${image ? `<img src="${imageUrl(image.id)}" alt="${escape(image.altText || project.name)}">` : `<span class="project-graphic"></span>`}<span><strong>${escape(project.name)}</strong><small>${escape(project.tagline || "Founder composition & project story")}</small></span><b>↗</b></a>`;
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
    const brief = project.details?.length ? `<section class="brief"><p class="kicker">Recovered project brief</p>${project.details.map((section) => `<article><h3>${escape(section.heading)}</h3><p>${escape(section.body).replace(/\n/g, "<br>")}</p></article>`).join("")}</section>` : "";
    document.querySelector("#project-detail").innerHTML = `<div class="project-header"><p class="kicker">${escape(project.tagline || "Project brief")}</p><h2>The project record</h2><p>Updated ${new Date(project.updatedAt).toLocaleDateString()}</p></div><div class="gallery">${gallery}</div>${brief}<div class="ledger"><section><p class="kicker">Composition</p><h3>People behind it</h3>${ownershipChart(project.contributors)}<ul>${people}</ul></section><section><p class="kicker">Audit trail</p><h3>Recorded decisions</h3><ul class="updates">${updates || "<li><span>No updates yet.</span></li>"}</ul></section></div>`;
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
    } catch (error) {
      console.error("TampalIdea project load failed", error);
      document.querySelector("#project-list").innerHTML = '<p class="loading">The private project ledger is temporarily unavailable.</p>';
    }
  }
  start();
})();
