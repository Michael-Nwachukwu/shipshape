# Locus Deploy — VS Code Extension

Deploy, manage, and monitor full-stack apps on **Locus** without leaving your editor.

Built for the Paygentic Hackathon #2 — _Build with Locus_ track.

---

## What it does

**One-click deploy from the editor.** Open any Next.js / Express / FastAPI / Django / Rails / Dockerfile project, hit `Locus: Deploy Workspace`, and watch build logs stream in real time as your app goes live on an HTTPS URL — no browser, no terminal, no config file hand-writing.

### Highlights

- 🚀 **Auto project-type detection** — Next.js, Vite, Express, FastAPI, Django, Rails, Docker, and more
- 📄 **Auto `.locusbuild` generation** — framework-appropriate config written for you, with a diff preview before commit
- 🐳 **Auto Dockerfile injection** — where Nixpacks defaults would bind to the wrong port (e.g. Vite + Caddy), the extension writes a corrected Dockerfile, commits, and pushes before deploy
- 📜 **Live build + runtime log streaming** — SSE straight into a VS Code output channel
- 🌐 **Status bar indicator** — idle / building / deploying / healthy / failed, with the live URL click-to-open
- 🤖 **AI failure diagnosis + auto-fix loop** — when a deploy fails, Gemini 2.5 Flash reads the logs + project files, explains the root cause, and (when safe) proposes a single-file fix that the extension will commit, push, and redeploy for you
- 🌲 **Service explorer sidebar** — Projects → Environments → Services → Deployments with live status icons and right-click actions (Deploy / Restart / Rollback / View Logs / Manage Env Vars / Open Live URL)
- ⚙️ **Environment variable manager** — VS Code webview panel to view, add, edit, and delete env vars, with automatic redeploy on save
- 🔁 **`.locusbuild` sync on redeploy** — edits to healthCheck or other service-level config are now PATCHed onto the running service automatically before the next deployment

---

## Installation

### Prerequisites

- VS Code 1.85 or later
- A Locus Build API key (starts with `claw_`) from [beta.buildwithlocus.com](https://beta.buildwithlocus.com)
- A GitHub repo with your code pushed, and GitHub connected at [beta.buildwithlocus.com/integrations](https://beta.buildwithlocus.com/integrations)

### Install the `.vsix`

```bash
code --install-extension locus-deploy-0.1.0.vsix
```

Or from inside VS Code: `Extensions` panel → `...` menu → `Install from VSIX...` → pick the file.

### Configure

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **`Locus: Configure API Key`** and paste your `claw_...` key
3. (Optional but recommended) Run **`Locus: Configure Gemini API Key`** with a free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — this enables AI failure diagnosis

---

## Usage

### First deploy

1. Open your project folder in VS Code
2. Click the rocket icon in the activity bar (left sidebar) → Locus panel opens
3. `Cmd+Shift+P` → **`Locus: Deploy Workspace`**
4. Follow the prompts: confirm detected project type, review generated `.locusbuild`, enter GitHub repo (`owner/repo`)
5. Watch build logs stream into the output channel; status bar updates live
6. When healthy, a notification shows the live URL — click **Open in Browser**

### Sidebar actions

Right-click any service or deployment node:

| Action | Target | What it does |
|---|---|---|
| Deploy | service | Trigger a fresh deployment |
| Restart | service | Restart running containers |
| Rollback | service / deployment | Redeploy the previous healthy image |
| View Logs | service / deployment | Stream runtime logs or fetch deployment logs |
| Manage Env Vars | service | Open the env var webview panel |
| Open Live URL | service | Open the service URL in your browser |

### Environment variables

Right-click a service → **Manage Environment Variables** → panel opens with current vars. Add, edit, or delete rows, then click **Save & Deploy** — the extension PUTs the new variables and triggers a redeploy automatically.

### AI failure diagnosis

When a deploy fails, if you have a Gemini key configured, the extension will:

1. Fetch the full deployment logs
2. Send the failure phase + log tail + relevant project files (Dockerfile, `.locusbuild`, `package.json`, etc.) to Gemini
3. Surface a human-readable root cause and confidence level
4. If the fix is a safe single-file replace, show **Apply & redeploy** — one click to write the file, commit, push, and trigger a new deployment
5. If the issue needs a rename, multi-file change, or human judgement, the channel tells you explicitly

---

## Commands

| Command | Description |
|---|---|
| `Locus: Deploy Workspace` | One-click deploy (the main command) |
| `Locus: Configure API Key` | Set your Locus Build API key |
| `Locus: Configure Gemini API Key` | Set your Gemini key (for AI features) |
| `Locus: View Logs` | Stream runtime logs for a service |
| `Locus: Open Live URL` | Open a service URL |
| `Locus: Restart Service` | Restart running containers |
| `Locus: Rollback Deployment` | Roll back to a previous healthy deploy |
| `Locus: Manage Environment Variables` | Open the env var panel |
| `Locus: Refresh Services` | Reload the sidebar tree |

---

## Configuration

Set in workspace or user settings:

| Setting | Default | Description |
|---|---|---|
| `locus.githubRepo` | — | Default GitHub repo in `owner/repo` format |
| `locus.defaultRegion` | `us-east-1` | Default Locus region (`us-east-1` or `sa-east-1`) |

API keys are stored in VS Code SecretStorage — never in settings, never logged.

---

## Security

- **API keys** live in `context.secrets` (encrypted SecretStorage), never in plain settings or logs
- **JWT tokens** are cached in memory only — never persisted
- **Build key** (`claw_...`) and **Gemini key** are stored under separate secret keys
- The extension never transmits secrets to any service other than Locus and Google (for Gemini)

---

## Troubleshooting

- **"Insufficient credits"** (HTTP 402) — add credits at [beta.buildwithlocus.com/billing](https://beta.buildwithlocus.com/billing). Each service costs $0.25/mo; new accounts get $1 free.
- **Private repo access denied** — connect GitHub at [beta.buildwithlocus.com/integrations](https://beta.buildwithlocus.com/integrations) first.
- **Deploy stuck in restart loop** — your healthCheck path is probably returning non-200. Either add a DB-free `/api/health` route or fix the dependency. The extension now syncs `.locusbuild` healthCheck changes to existing services automatically.
- **AI diagnosis says "malformed JSON"** — transient Gemini hiccup; the client retries automatically. If it persists, check your Gemini key quota.

---

## Development

```bash
cd extension
npm install
npm run compile            # build once
npm run watch              # rebuild on change
npm run typecheck          # TypeScript check only
```

Press `F5` to launch an Extension Development Host with the extension loaded.

### Build a `.vsix`

```bash
npx @vscode/vsce package
```

---

## License

MIT
