# TampalIdea

A consent-first contributor and ownership tracker built by Riven Buildsmith.

## Staging verification

Run the focused ownership test:

```sh
node --test ownership.test.js
```

The staging deployment is intentionally `noindex,nofollow`. Browser-local contributor records remain available, while shared founder compositions are stored by the local service and displayed separately.

## Shared founder composition adapter

Start the staging app with a non-empty `TAMPALIDEA_ADMIN_TOKEN` and, optionally, a durable `TAMPALIDEA_DATA_DIR` outside the repository. The mutation API accepts only bearer-token requests on `POST /api/projects/composition`; browser reads use `GET /api/projects`.

Orin's adapter is `scripts/orin-update-composition.js`. It accepts one JSON object through stdin and does not execute input as shell commands or read arbitrary files. An operator must make the same token available to the adapter and permit its use only for an explicit owner-authorised request. Example input:

```json
{"projectName":"SAJI by Syam","actor":"Orin Forgekeeper","reason":"Founder-authorised ownership composition update","sourceReference":"WhatsApp owner request","contributors":[{"name":"Hisyam","role":"Founder","ownership":50},{"name":"Sayyid Khan","role":"Founder","ownership":50}]}
```

The application never treats this administrative record as proof of legal ownership. Obtain appropriate legal advice before issuing shares or relying on an equity record.

## Verification

```sh
node --test ownership.test.js composition.test.js
TAMPALIDEA_ADMIN_TOKEN=replace-me node server.js
```
