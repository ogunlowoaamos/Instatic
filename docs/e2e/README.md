# User E2E Testing

This folder defines the agent-run browser testing workflow for Page Builder CMS.

- `protocol.md` explains how an agent should run user-facing E2E audits.
- `feature-matrix.md` lists scenario rows by product area.
- `run-log-template.md` is copied into `runs/` for each audit.
- `runs/` stores completed run logs.

## Common Requests

Use these prompts with Codex:

- "Run the Core Owner Lifecycle E2E protocol."
- "Run rows MEDIA-001 through MEDIA-003."
- "Run a friction audit of the visual builder."
- "Retest E2E-20260514-01 from the last run."
- "Promote PUB-001 into automated smoke coverage."

The project-local `page-builder-user-e2e` skill should load for those requests and keep the agent focused on browser-observed user behavior.
