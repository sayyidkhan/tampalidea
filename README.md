# TampalIdea

TampalIdea is a private, founder-authorised project ledger. Each project has a shareable staging route at `/<project-slug>` with a brochure-style dossier, contributor composition, audit trail and attached visual references.

## Data and access model

- Project, contributor, audit and attachment metadata is stored in an app-scoped SQLite database at `TAMPALIDEA_DATA_DIR/tampalidea.sqlite`.
- Existing `shared-compositions.json` data is migrated on the first SQLite startup.
- Read routes are public staging views with `noindex,nofollow` headers. Write routes accept only Zo-local callers on loopback or the authenticated private gateway; the public gateway explicitly marks traffic as read-only.
- Zo agents use the local `http://127.0.0.1:8808` interface directly; no agent token is required or stored.
- Image uploads accept only JPEG, PNG, WebP and GIF, with a 5 MB limit, and are linked to one project. The first image becomes its cover automatically; a later founder-authorised selection can replace it.
- Dossier sections and an optional HTTPS-linked live app preview are stored alongside the project and recorded in the audit trail. The project page displays the link and a lazy-loaded live preview beneath it.

## Agent adapter

`scripts/orin-update-composition.js` sends one founder-authorised composition JSON object from stdin to the Zo-local API. It optionally accepts `TAMPALIDEA_API_URL` (default `http://127.0.0.1:8808`).

```sh
printf '%s' '{"projectName":"Batam 100","actor":"Orin Forgekeeper","reason":"Founder-authorised update","sourceReference":"Owner request","contributors":[{"name":"Sayyid Khan","role":"Founder","ownership":50},{"name":"Hisyam","role":"Founder","ownership":50}]}' | node scripts/orin-update-composition.js
```

`scripts/orin-update-project-details.js` updates a named project dossier with the same owner-authorised, token-gated path. It accepts `slug`, `actor`, `reason`, `sourceReference`, a `details` array of `{ heading, body }` sections, and optional `appUrl` / `appLabel` fields for the live app preview.

`scripts/orin-upload-project-image.js` accepts a founder-authorised JSON object containing `slug`, `filename`, `mimeType`, `dataBase64`, `altText`, `actor`, `reason`, `sourceReference`, and optional `cover: true`. `scripts/orin-select-project-cover.js` accepts `slug`, `attachmentId`, `actor`, `reason`, and `sourceReference` to make an existing image the single project cover. Both communicate only with the Zo-local interface.

## Agent change interface

Any Zo-local agent can use `scripts/project-ledger-agent.js`. It accepts an input JSON `action` of:

- `details.replace` — replace a project’s detail sections and optional `appUrl` / `appLabel`.
- `image.add` — attach an image using `dataBase64`, or a `filePath` within `/home/workspace`; the first image becomes the cover unless `cover: true` selects it.
- `image.update` — update an image’s `altText` or set `cover: true`.
- `image.setCover` — select an existing `attachmentId` as cover.
- `image.delete` — remove an attachment; if it was the cover, the newest remaining image becomes the cover.

Every request needs `slug`, `actor`, `reason`, and `sourceReference`, and creates an append-only audit event. The app never grants unauthenticated browser write access.

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
