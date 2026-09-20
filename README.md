# TampalIdea

TampalIdea is a private, founder-authorised project ledger. Each project has a shareable staging route at `/<project-slug>` with a brochure-style dossier, contributor composition, audit trail and attached visual references.

## Data and access model

- Project, contributor, audit and attachment metadata is stored in an app-scoped SQLite database at `TAMPALIDEA_DATA_DIR/tampalidea.sqlite`.
- Existing `shared-compositions.json` data is migrated on the first SQLite startup.
- Read routes are public staging views with `noindex,nofollow` headers. Write routes require a bearer token and never accept unauthenticated browser mutations.
- Set `TAMPALIDEA_AGENT_TOKEN` for Orin/Riven's constrained API access. `TAMPALIDEA_ADMIN_TOKEN` is also accepted for founder operations.
- Image uploads accept only JPEG, PNG, WebP and GIF, with a 5 MB limit, and are linked to one project. The first image becomes its cover automatically; a later founder-authorised selection can replace it.
- Dossier sections and an optional HTTPS-linked live app preview are stored alongside the project and recorded in the audit trail. The project page displays the link and a lazy-loaded live preview beneath it.

## Agent adapter

`scripts/orin-update-composition.js` sends one founder-authorised composition JSON object from stdin to the local API. It needs `TAMPALIDEA_AGENT_TOKEN` and optionally `TAMPALIDEA_API_URL` (default `http://127.0.0.1:8808`).

```sh
printf '%s' '{"projectName":"Batam 100","actor":"Orin Forgekeeper","reason":"Founder-authorised update","sourceReference":"Owner request","contributors":[{"name":"Sayyid Khan","role":"Founder","ownership":50},{"name":"Hisyam","role":"Founder","ownership":50}]}' | node scripts/orin-update-composition.js
```

`scripts/orin-update-project-details.js` updates a named project dossier with the same owner-authorised, token-gated path. It accepts `slug`, `actor`, `reason`, `sourceReference`, a `details` array of `{ heading, body }` sections, and optional `appUrl` / `appLabel` fields for the live app preview.

`scripts/orin-upload-project-image.js` accepts a founder-authorised JSON object containing `slug`, `filename`, `mimeType`, `dataBase64`, `altText`, `actor`, `reason`, `sourceReference`, and optional `cover: true`. `scripts/orin-select-project-cover.js` accepts `slug`, `attachmentId`, `actor`, `reason`, and `sourceReference` to make an existing image the single project cover. Both require `TAMPALIDEA_AGENT_TOKEN`.

## Agent change interface

Any authorised agent can use `scripts/project-ledger-agent.js` with `TAMPALIDEA_AGENT_TOKEN`. It accepts an input JSON `action` of:

- `details.replace` — replace a project’s detail sections and optional `appUrl` / `appLabel`.
- `image.add` — attach an image using `dataBase64`, or a `filePath` within `/home/workspace`; the first image becomes the cover unless `cover: true` selects it.
- `image.update` — update an image’s `altText` or set `cover: true`.
- `image.setCover` — select an existing `attachmentId` as cover.
- `image.delete` — remove an attachment; if it was the cover, the newest remaining image becomes the cover.

Every request needs `slug`, `actor`, `reason`, and `sourceReference`, and creates an append-only audit event. The app never grants unauthenticated browser write access.

## Verify

```sh
node --test ownership.test.js composition.test.js database.test.js
```
