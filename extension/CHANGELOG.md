# Changelog

All notable user-facing changes to the ShipShape VS Code extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Custom domains (BYOD)** — right-click a service → **ShipShape: Add Custom Domain**. Webview walks through registering the domain, copying DNS records (routing + SSL validation CNAMEs), manually triggering verification, and attaching to the service. Remove flow (detach + delete) is built into the same panel.
- **Domain tooltip in service tree** — services with attached custom domains show `🌐 https://…` in the tooltip and a globe glyph in the description.
- **Purchase link-out** — "Purchase a new domain" button opens `beta.buildwithlocus.com/domains` in the browser (in-editor purchase flow is not supported to keep the extension focused).
- **`ShipShape: Manage Domains`** — workspace-wide command lists every domain (attached, validating, pending, orphaned) via QuickPick and removes the selected one. Covers the case where an unattached domain can't be reached through the service-scoped panel (e.g. after a reinstall).

## [0.1.0] — 2026-04-19

Initial public release.

### Added
- **One-click deploy** — `ShipShape: Deploy Workspace` detects project type (Next.js, Express, FastAPI, Django, Rails, Docker, and generic Node/Python), generates a `.locusbuild`, and deploys to Locus via `POST /projects/from-repo`.
- **Project detector** (`lib/detector.ts`) — priority-ordered framework detection across 10 project types.
- **`.locusbuild` generator** (`lib/locusbuild.ts`) — per-framework templates using Nixpacks-compatible defaults.
- **SSE log streaming** into an output channel during build + runtime phases.
- **Custom sailboat status bar icon** (`$(shipshape-logo)`) backed by a generated WOFF icon font.
- **Service explorer** — 4-level sidebar tree (projects → environments → services → deployments) with a 30-second cache.
- **Right-click context actions** — Deploy, Restart, Rollback, View Logs, Manage Env Vars, Open Live URL, Toggle Auto-Deploy.
- **Environment variable manager** — webview panel per service with CSP-locked inline script. Save flow auto-triggers a redeploy.
- **Natural language deploy** — `ShipShape: Deploy with AI` generates a `.locusbuild` from a plain-English description via Gemini 2.5 Flash with `responseSchema`-enforced structured output. Dual-mode: workspace detection OR remote GitHub URL (no local clone required, uses `POST /projects/from-locusbuild`).
- **AI failure diagnosis** — on a failed deployment, reads build/runtime logs, asks Gemini to classify the root cause + propose a safe auto-fix, and surfaces an `Apply & Redeploy` button for high-confidence single-file changes.
- **Auto-deploy toggle** (Approach B) — right-click a service → **Toggle Auto-Deploy** flips `autoDeploy` server-side. Tree shows a `· auto $(sync)` badge on enabled services.
- **Consistent error handling** (`lib/errorFormat.ts`) — 401/402/404/409/429/5xx all rendered as user-friendly notifications with context-appropriate action buttons (Re-enter API Key, Add Credits, etc.).
- **`.locusbuild` drift prevention** — `syncServiceFromLocusBuild` PATCHes `healthCheckPath` and runtime fields on existing services before every redeploy, preventing silent config drift.
- **Gemini transient-error retry** — exponential backoff on 429/500/502/503/504 (2 retries, 1.5s → 3s).
- **ShipShape brand** — sailboat activity-bar icon, ShipShape-prefixed commands + notifications, `shipshape.*` config + secret keys.

### Known limitations
- **Multi-tenant provisioner** — `shipshape.provisionTenant` command is registered but not implemented. Will no-op or be removed in a future release.
- **Gemini API key** — must be configured separately from the Locus Build API key (`ShipShape: Configure Gemini API Key`).
- **Remote-mode NL deploy** — cannot detect existing projects by repo; backend will reject duplicate project names.

---

[Unreleased]: https://github.com/michael-nwachukwu/shipshape/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/michael-nwachukwu/shipshape/releases/tag/v0.1.0
