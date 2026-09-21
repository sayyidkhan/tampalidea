# TampalIdea

TampalIdea is a founder-authorised project IP ledger for contributor roles, recorded ownership shares and decisions. Regular projects have a public staging route at `/<project-slug>` with a dossier, contributor composition, audit trail and attached visual references; WhatsApp group projects stay scoped to their linked chat.

The landing page explains the ledger through people, history and project context. Its live preview, project count and ownership summaries use only the public regular-project response. Landing styles are scoped to `.landing-page`; project dossiers retain their own layout. The preview handles empty and unavailable records without showing invented data.

The portfolio has List and Table tabs on the right of its header. Both use the same public project response and preserve group visibility restrictions. Table view shows project covers, contributor counts, ownership allocations and update dates; the browser remembers the selected view. Tabs support arrow keys and Home/End, and the table scrolls horizontally on small screens.

The public `/terms` page states the claims policy: a project has a 14-day claim window from its recorded creation timestamp; a claim counts only when its claimant, share or role, and basis are recorded in the project audit trail. After the window, unclaimed ownership defaults to Sayyid Khan unless the audit trail records a different founder-authorised outcome. The page is an operating policy and explicitly does not replace a signed agreement or independent legal advice.

The generated Batam 100 cover and its generation prompt are kept in `assets/batam-100-cover.png` and `assets/batam-100-cover.md`; the live cover is served through the project attachment API.

## Data and access model

- Project, contributor, audit and attachment metadata is stored in an app-scoped SQLite database at `TAMPALIDEA_DATA_DIR/tampalidea.sqlite`.
- Existing `shared-compositions.json` data is migrated on the first SQLite startup.
- Read routes are public staging views with `noindex,nofollow` headers. Write routes accept only Zo-local callers on loopback or the authenticated private gateway; the public gateway explicitly marks traffic as read-only.
- Zo agents use the local `http://127.0.0.1:8808` interface directly; no agent token is required or stored.
- Image uploads accept only JPEG, PNG, WebP and GIF, with a 5 MB limit, and are linked to one project. The first image becomes its cover automatically; a later founder-authorised selection can replace it.
- The owner-only browser image manager is served at `https://private-apps-sayyidkhan.zo.computer/tampalidea/`. It supports adding, replacing, describing, selecting the cover and deleting images without exposing write controls on the public staging route.
- Dossier sections and an optional HTTPS-linked live app preview are stored alongside the project and recorded in the audit trail. The project page displays the link and a lazy-loaded live preview beneath it.
- Each project has a `visibilityScope`: `regular` (the default) or `whatsapp_group`. A group project stores its canonical WhatsApp group JID and is unavailable from the public staging API and URL. Only the Zo-local group-agent endpoints can list or read it, and only when given the exact bound group JID.

## Agent adapter

`scripts/orin-update-composition.js` sends one founder-authorised composition JSON object from stdin to the Zo-local API. It optionally accepts `TAMPALIDEA_API_URL` (default `http://127.0.0.1:8808`).

```sh
printf '%s' '{"projectName":"Batam 100","actor":"Orin Forgekeeper","reason":"Founder-authorised update","sourceReference":"Owner request","contributors":[{"name":"Sayyid Khan","role":"Founder","ownership":50},{"name":"Hisyam","role":"Founder","ownership":50}]}' | node scripts/orin-update-composition.js
```

`scripts/orin-update-project-details.js` updates a named project dossier with the same owner-authorised, token-gated path. It accepts `slug`, `actor`, `reason`, `sourceReference`, a `details` array of `{ heading, body }` sections, and optional `appUrl` / `appLabel` fields for the live app preview.

`scripts/orin-upload-project-image.js` accepts a founder-authorised JSON object containing `slug`, `filename`, `mimeType`, `dataBase64`, `altText`, `actor`, `reason`, `sourceReference`, and optional `cover: true`. `scripts/orin-select-project-cover.js` accepts `slug`, `attachmentId`, `actor`, `reason`, and `sourceReference` to make an existing image the single project cover. Both communicate only with the Zo-local interface.

## Agent change interface

Any Zo-local agent can use `scripts/project-ledger-agent.js`. It accepts an input JSON `action` of:

- `project.list` — list projects bound to the trusted `whatsappGroupId`.
- `project.portfolio` — list only public `regular` projects; it never returns WhatsApp-group projects, private memories or group bindings.
- `project.get` — retrieve one project bound to the trusted `whatsappGroupId`.
- `project.create` — create a `whatsapp_group` project with its trusted `whatsappGroupId`.
- `access.update` — move an existing project between `regular` and `whatsapp_group`; this must remain founder-authorised.
- `details.replace` — replace a project’s detail sections and optional `appUrl` / `appLabel`.
- `image.add` — attach an image using `dataBase64`, or a `filePath` within `/home/workspace`; the first image becomes the cover unless `cover: true` selects it.
- `image.update` — update an image’s `altText` or set `cover: true`.
- `image.setCover` — select an existing `attachmentId` as cover.
- `image.delete` — remove an attachment; if it was the cover, the newest remaining image becomes the cover.

Every action except `project.list` needs `slug`, `actor`, `reason`, and `sourceReference`; `project.create` also needs `projectName` and contributor composition. Every write creates an append-only audit event. The app never grants unauthenticated browser write access.

`whatsappGroupId` must be the exact group ID supplied by the WhatsApp transport (for example, `120363410715375967@g.us`), never a value asserted by a member. The public staging site intentionally shows only `regular` projects; group projects are visible through Orin only in their bound chat.

## Project memory layer

Each project has a private memory layer that is deliberately excluded from public dossier and project API responses. Zo-local chat agents use `scripts/project-ledger-agent.js` with:

- `memory.list` — retrieve a project’s current private memories.
- `memory.create` — add a `title`, `content`, optional `type` (`note`, `decision`, `fact`, `todo`, `reference`) and `tags`.
- `memory.update` — change a memory by `memoryId`.
- `memory.delete` — remove a memory by `memoryId`.

Create, update and delete operations require `actor`, `reason` and `sourceReference`; each is captured in the project’s append-only audit record. Memory reads are available only from the Zo-local or private-gateway lane.

## Verify

```sh
node --test ownership.test.js composition.test.js database.test.js
```
