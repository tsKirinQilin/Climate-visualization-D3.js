# Presentation fallback cache

This folder is intentionally tracked in Git.

The server first tries to fetch fresh data. If the upstream API does not answer within the interactive timeout, the application falls back to the newest cached snapshot available in `server/cache/runtime` or this folder.

Before the defense, run the application and visit the demo locations/modes you plan to show, then run:

```bash
npm run cache:promote
```

Commit the updated `server/cache/presentation` folder to GitHub. Do not place API keys here.
