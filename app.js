(() => {
  const pathname = window.location.pathname.replace(/\/$/, "");
  const pathParts = pathname.split("/").filter(Boolean);
  const isProject = pathParts.at(-1) !== "tampalidea";
  document.body.classList.add(isProject ? "project-page" : "landing-page");
  const slug = isProject ? pathParts.at(-1) : null;
  const base = `/${(isProject ? pathParts.slice(0, -1) : pathParts).join("/")}`.replace(/\/$/, "");
  const api = (suffix) => `${base}/api${suffix}`;
  document.querySelector(".wordmark").href = `${base}/`;
  if (isProject) {
    const back = document.querySelector("#back-projects");
    back.hidden = false;
    back.href = `${base}/#projects`;
  }
  const escape = (value) => String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const format = (units) => `${(Number(units) / 100).toFixed(2).replace(/\.00$/, "")}%`;
  function imageUrl(id) { return `${base || ""}/media/${id}`; }
  function coverImage(project) { return project.attachments?.find((asset) => asset.isCover) || project.attachments?.[0]; }
  function renderLedgerPreview(project) {
    const target = document.querySelector(".cover-art");
    if (!project) {
      target.innerHTML = '<div class="preview-empty"><p class="kicker">Project IP Ledger</p><h2>The next idea<br>starts a new record.</h2><p>Project records bring people, ownership and decisions together.</p></div>';
      return;
    }
    const cover = coverImage(project);
    const colours = ["#ee6a3c", "#afc944", "#456e59", "#9f91b3"];
    const people = project.contributors.map((person, index) => `<li><span class="person-dot" style="background:${colours[index % colours.length]}" aria-hidden="true"></span><span class="preview-person"><strong>${escape(person.name)}</strong><small>${escape(person.role)}</small></span><b>${format(person.ownership)}</b></li>`).join("");
    const bars = project.contributors.map((person, index) => `<span style="flex:${Math.max(0, Number(person.ownership) || 0)};background:${colours[index % colours.length]}"></span>`).join("");
    const latest = project.audit?.at(-1);
    const date = latest ? new Date(latest.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
    target.innerHTML = `<div class="preview-top"><span><span class="status-dot" aria-hidden="true"></span> TampalIdea IP ledger</span><span>LIVE RECORD</span></div><div class="preview-stage">${cover ? `<img src="${imageUrl(cover.id)}" alt="">` : '<span class="preview-monogram" aria-hidden="true">TI</span>'}<div class="preview-stage-shade"></div><div class="preview-stage-copy"><p class="kicker">Project record · ${escape(project.slug)}</p><h2>${escape(project.name)}</h2><span>Ownership on record</span></div><div class="preview-file-mark" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="preview-body"><div class="preview-label"><div><p class="kicker">Ownership allocation</p><h3>Who owns this idea</h3></div><span>${project.contributors.length} ${project.contributors.length === 1 ? "owner" : "owners"}</span></div><div class="allocation-bar" aria-hidden="true">${bars}</div><ul class="preview-people">${people}</ul>${latest ? `<div class="preview-audit"><span class="audit-icon" aria-hidden="true">↳</span><div><p class="kicker">Latest record · ${escape(date)}</p><p>${escape(latest.reason)}</p><small>Recorded by ${escape(latest.actor)}</small></div></div>` : '<p class="loading">No decisions recorded yet.</p>'}</div><a class="preview-link" href="${base}/${project.slug}"><span>Open the full project record</span><span aria-hidden="true">↗</span></a>`;
  }
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
    const legend = contributors.map((person, index) => `<li><i style="background:${colours[index % colours.length]}" aria-hidden="true"></i><span><strong>${escape(person.name)}</strong><small>${escape(person.role)}</small></span><b>${format(person.ownership)}</b></li>`).join("");
    return `<div class="ownership-chart"><figure class="ownership-visual"><svg viewBox="0 0 140 140" role="img" aria-label="Recorded ownership distribution"><circle cx="70" cy="70" r="54" fill="none" stroke="#ddd8c8" stroke-width="20"/>${slices}<text x="70" y="64" text-anchor="middle">ALLOCATED</text><text x="70" y="84" text-anchor="middle">100%</text></svg><figcaption>${contributors.length} ${contributors.length === 1 ? "contributor" : "contributors"}</figcaption></figure><div class="ownership-breakdown"><div class="ownership-columns" aria-hidden="true"><span>Contributor</span><span>Share</span></div><ul aria-label="Contributor ownership shares">${legend}</ul></div></div>`;
  }
  function projectCard(project) {
    const image = coverImage(project);
    return `<a class="project-card" href="${base}/${project.slug}"><span class="project-number"><span>PROJECT RECORD</span><span>${String(project.contributors.length).padStart(2, "0")} CONTRIBUTORS</span></span>${image ? `<img src="${imageUrl(image.id)}" alt="${escape(image.altText || project.name)}" loading="lazy">` : `<span class="project-graphic"></span>`}<span class="card-summary"><strong>${escape(project.name)}</strong><small>${escape(project.tagline || "Contributor roles, ownership & project history")}</small></span><span class="card-shares">${project.contributors.map((person) => `<span>${escape(person.name)} <b>${format(person.ownership)}</b></span>`).join("")}</span><span class="card-open">Open project record <b aria-hidden="true">↗</b></span></a>`;
  }
  function projectTable(projects) {
    const rows = projects.map((project) => {
      const image = coverImage(project);
      const date = new Date(project.updatedAt);
      const updated = Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const ownership = project.contributors.map((person) => `<li><span>${escape(person.name)}</span><b>${format(person.ownership)}</b></li>`).join("");
      return `<tr><th scope="row"><a class="table-project" href="${base}/${project.slug}">${image ? `<img src="${imageUrl(image.id)}" alt="" loading="lazy">` : '<span class="table-project-placeholder" aria-hidden="true"></span>'}<span><strong>${escape(project.name)}</strong><small>${escape(project.tagline || "Founder composition & project story")}</small></span><span class="table-arrow" aria-hidden="true">↗</span></a></th><td class="table-people">${String(project.contributors.length).padStart(2, "0")}</td><td><ul class="table-ownership">${ownership}</ul></td><td class="table-updated">${updated}</td></tr>`;
    }).join("");
    return `<table class="project-table"><caption class="sr-only">Projects, people, ownership and last update</caption><thead><tr><th scope="col">Project</th><th scope="col">People</th><th scope="col">Ownership</th><th scope="col">Updated</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function imageManager(project) {
    const cards = project.attachments.map((asset) => `<article class="image-manager-card"><img src="${imageUrl(asset.id)}" alt="${escape(asset.altText || asset.filename)}"><div class="image-manager-card-copy"><div><p class="kicker">${asset.isCover ? "Current cover" : "Project image"}</p><strong>${escape(asset.filename)}</strong></div><form data-update-image="${asset.id}" class="image-alt-form"><label>Image description<input name="altText" value="${escape(asset.altText)}" maxlength="240" required></label><button type="submit" class="editor-button editor-button-secondary">Save description</button></form><form data-replace-image="${asset.id}" class="image-replace-form"><label>Replace image<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label><button type="submit" class="editor-button editor-button-secondary">Replace image</button></form><div class="image-manager-actions">${asset.isCover ? '<span class="cover-status">Cover image</span>' : `<button type="button" class="editor-button editor-button-secondary" data-image-action="cover" data-image-id="${asset.id}">Make cover</button>`}<button type="button" class="editor-button editor-button-danger" data-image-action="delete" data-image-id="${asset.id}" data-image-name="${escape(asset.filename)}">Delete</button></div></div></article>`).join("") || '<p class="loading">No project images yet. Add the first reference below.</p>';
    return `<section id="image-manager" class="image-manager" aria-labelledby="image-manager-title"><div class="image-manager-heading"><div><p class="kicker">Owner controls</p><h3 id="image-manager-title">Manage project images</h3><p>Images are stored in this project record and every change is recorded in its audit trail.</p></div></div><form id="image-upload-form" class="image-upload-form"><label>Add image<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label><label>Image description<input name="altText" maxlength="240" placeholder="Describe the image for this project" required></label><label class="cover-choice"><input name="cover" type="checkbox"> Use as cover image</label><button type="submit" class="editor-button">Add image</button></form><p id="image-manager-status" class="image-manager-status" role="status" aria-live="polite"></p><div class="image-manager-grid">${cards}</div></section>`;
  }
  function fileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The image could not be read."));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(file);
    });
  }
  function setEditorStatus(message, error = false) {
    const status = document.querySelector("#image-manager-status");
    if (status) { status.textContent = message; status.classList.toggle("is-error", error); }
  }
  async function imageRequest(path, method, body) {
    const response = await fetch(api(path), { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The image change could not be saved.");
    return payload;
  }
  async function imageInput(file) {
    if (!file) throw new Error("Choose an image first.");
    if (file.size > 5_000_000) throw new Error("Choose an image smaller than 5 MB.");
    return { filename: file.name, mimeType: file.type, dataBase64: await fileBase64(file) };
  }
  function bindImageManager(project, refresh) {
    const manager = document.querySelector("#image-manager");
    if (!manager) return;
    const audit = (reason) => ({ actor: "Sayyid Khan", reason, sourceReference: "Private TampalIdea image manager" });
    manager.addEventListener("submit", async (event) => {
      const form = event.target;
      if (!form.matches("#image-upload-form,[data-update-image],[data-replace-image]")) return;
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        if (form.id === "image-upload-form") {
          const file = form.elements.image.files[0];
          await imageRequest(`/projects/${project.slug}/attachments`, "POST", { ...(await imageInput(file)), altText: form.elements.altText.value.trim(), cover: form.elements.cover.checked, ...audit("Owner image upload") });
        } else if (form.dataset.updateImage) {
          await imageRequest(`/projects/${project.slug}/attachments/${form.dataset.updateImage}`, "PATCH", { altText: form.elements.altText.value.trim(), ...audit("Owner image description update") });
        } else {
          const file = form.elements.image.files[0];
          await imageRequest(`/projects/${project.slug}/attachments/${form.dataset.replaceImage}/image`, "PUT", { ...(await imageInput(file)), altText: form.closest(".image-manager-card").querySelector("[name=altText]").value.trim(), ...audit("Owner image replacement") });
        }
        setEditorStatus("Saved. Refreshing the project record…");
        await refresh();
      } catch (error) { setEditorStatus(error.message, true); } finally { button.disabled = false; }
    });
    manager.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-image-action]");
      if (!button) return;
      const { imageAction: action, imageId: id, imageName: name } = button.dataset;
      if (action === "delete" && !window.confirm(`Delete ${name}? This cannot be undone.`)) return;
      button.disabled = true;
      try {
        if (action === "cover") await imageRequest(`/projects/${project.slug}/attachments/${id}/cover`, "POST", audit("Owner cover image selection"));
        if (action === "delete") await imageRequest(`/projects/${project.slug}/attachments/${id}`, "DELETE", audit("Owner image deletion"));
        setEditorStatus("Saved. Refreshing the project record…");
        await refresh();
      } catch (error) { setEditorStatus(error.message, true); } finally { button.disabled = false; }
    });
  }
  function setupViewToggle() {
    const tabs = Array.from(document.querySelectorAll("[data-view]"));
    function select(view, remember = true) {
      tabs.forEach((tab) => {
        const active = tab.dataset.view === view;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
      });
      if (remember) {
        try { localStorage.setItem("tampalidea.projectView", view); } catch (_) {}
      }
    }
    let savedView = "list";
    try { if (localStorage.getItem("tampalidea.projectView") === "table") savedView = "table"; } catch (_) {}
    select(savedView, false);
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab.dataset.view));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        select(next.dataset.view);
        next.focus();
      });
    });
  }
  function renderDetail(project, canEdit, refresh) {
    document.title = `${project.name} — TampalIdea`;
    document.querySelector("#hero .kicker").textContent = "Project dossier";
    document.querySelector("#hero h1").innerHTML = `${escape(project.name).replace(/ /g, "<br>")}`;
    document.querySelector("#hero .lede").textContent = project.description || project.tagline || "A private record for this project’s people and direction.";
    document.querySelector("#projects").hidden = true;
    const cover = coverImage(project);
    const heroArt = document.querySelector(".cover-art");
    if (cover) heroArt.innerHTML = `<img src="${imageUrl(cover.id)}" alt="${escape(cover.altText || cover.filename)}" style="display:block;width:100%;height:100%;object-fit:cover">`;
    else heroArt.innerHTML = '<div class="preview-empty"><p class="kicker">Project IP Ledger</p><h2>People.<br>Ownership.<br>Decisions.</h2></div>';
    const gallery = project.attachments.map((asset) => `<figure><img src="${imageUrl(asset.id)}" alt="${escape(asset.altText || asset.filename)}"><figcaption>${asset.isCover ? "Cover image · " : ""}${escape(asset.altText || asset.filename)}</figcaption></figure>`).join("") || '<p class="loading">No visual references attached yet.</p>';
    const appPreview = project.appUrl ? `<section style="margin:0 0 70px;border-top:1px solid var(--ink);padding-top:24px"><div style="display:flex;gap:24px;justify-content:space-between;align-items:end;flex-wrap:wrap"><div><p class="kicker">Linked app</p><h3 style="margin:0;font:35px/1 'DM Serif Display',serif;letter-spacing:-.05em">${escape(project.appLabel || "Live project preview")}</h3><p style="margin:12px 0 0;color:#526158;font-size:12px;overflow-wrap:anywhere">${escape(project.appUrl)}</p></div><a class="button" href="${escape(project.appUrl)}" target="_blank" rel="noopener noreferrer">Open app <b>↗</b></a></div><iframe title="${escape(project.appLabel || project.name)} preview" src="${escape(project.appUrl)}" loading="lazy" referrerpolicy="no-referrer" style="display:block;width:100%;height:min(68vw,680px);min-height:420px;margin-top:24px;border:1px solid var(--ink);background:#fff"></iframe></section>` : "";
    const updates = project.audit.slice().reverse().map((event) => `<li><b>${escape(event.actor)}</b><span>${escape(event.reason)} · ${new Date(event.timestamp).toLocaleDateString()}</span></li>`).join("");
    const brief = project.details?.length ? `<section class="brief"><p class="kicker">Recovered project brief</p>${project.details.map((section) => `<article><h3>${escape(section.heading)}</h3><p>${escape(section.body).replace(/\n/g, "<br>")}</p></article>`).join("")}</section>` : "";
    document.querySelector("#project-detail").innerHTML = `<div class="project-header"><p class="kicker">${escape(project.tagline || "Project brief")}</p><h2>The project record</h2><p>Updated ${new Date(project.updatedAt).toLocaleDateString()}</p></div>${appPreview}<div class="gallery">${gallery}</div>${canEdit ? imageManager(project) : ""}${brief}<div class="ledger"><section><p class="kicker">Composition</p><h3>People behind it</h3>${ownershipChart(project.contributors)}</section><section><p class="kicker">Audit trail</p><h3>Recorded decisions</h3><ul class="updates">${updates || "<li><span>No updates yet.</span></li>"}</ul></section></div>`;
    document.querySelector("#project-detail").hidden = false;
    if (canEdit) bindImageManager(project, refresh);
  }
  async function start() {
    try {
      if (isProject) {
        const loadProject = async () => {
          const [projectResponse, accessResponse] = await Promise.all([
            fetch(api(`/projects/${slug}`), { headers: { Accept: "application/json" } }),
            fetch(api("/editor-access"), { headers: { Accept: "application/json" } })
          ]);
          if (!projectResponse.ok) throw new Error("Project unavailable");
          const project = (await projectResponse.json()).project;
          const canEdit = accessResponse.ok && Boolean((await accessResponse.json()).canEdit);
          renderDetail(project, canEdit, loadProject);
        };
        await loadProject();
      } else {
        setupViewToggle();
        const response = await fetch(api("/projects"), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Ledger unavailable");
        const projects = (await response.json()).projects;
        renderLedgerPreview(projects[0]);
        document.querySelector("#project-count").textContent = String(projects.length).padStart(2, "0");
        document.querySelector("#project-list").innerHTML = projects.length ? projects.map(projectCard).join("") : '<p class="loading">No projects have been recorded yet.</p>';
        document.querySelector("#project-table").innerHTML = projects.length ? projectTable(projects) : '<p class="loading">No projects have been recorded yet.</p>';
        if (window.location.hash === "#projects") {
          document.fonts.ready.then(() => document.querySelector("#projects").scrollIntoView({ block: "start" }));
        }
      }
    } catch (error) {
      console.error("TampalIdea project load failed", error);
      document.querySelector(".cover-art").innerHTML = '<div class="preview-empty"><p class="kicker">Project IP Ledger</p><h2>Record unavailable.</h2><p>Please try again shortly.</p></div>';
      if (isProject) {
        document.querySelector("#hero h1").textContent = "Project unavailable";
        document.querySelector("#hero .lede").textContent = "This project cannot be viewed from this link.";
        document.querySelector("#projects").hidden = true;
      }
      document.querySelector("#project-list").innerHTML = '<p class="loading">The private project ledger is temporarily unavailable.</p>';
      document.querySelector("#project-table").innerHTML = '<p class="loading">The private project ledger is temporarily unavailable.</p>';
    }
  }
  start();
})();
