# TampalIdea

A consent-first, browser-local contributor and ownership tracker built by Riven Buildsmith.

## Staging verification

Run the focused ownership test:

```sh
node --test ownership.test.js
```

The staging deployment is intentionally `noindex,nofollow`. It stores data only in the visitor's browser local storage and has no backend, authentication, WhatsApp integration, or shared contributor data.
