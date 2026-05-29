# Specs Operating System

This directory is the operational backbone of the Fitwell project. It tracks what we're building, why, and how we measure progress.

## How It Works

### Documents

| File | Purpose | Update Cadence |
|------|---------|---------------|
| [MISSION.md](MISSION.md) | North star — why we're building this | Rarely |
| [PRIORITIES.md](PRIORITIES.md) | Active workstreams with status | Every work session |
| [SCORECARD.md](SCORECARD.md) | Key metrics dashboard | Weekly |
| [proof-points.md](proof-points.md) | Stacked causes — how layers build on each other | Monthly |
| [releases.yaml](releases.yaml) | Ship trail — what went live and when | On each release |
| [ROLES.md](ROLES.md) | Who's who | When team composition changes |
| [contributor-setup.md](contributor-setup.md) | First-time machine setup: CLIs, service access, permissions | When a new service or contributor is added |
| [domains/](domains/) | Deep-dive knowledge by business domain | As questions arise |

### Workflow

1. **Start a work session** — check `PRIORITIES.md` for current workstreams and next steps
2. **Pick a priority** — update status to `🔨`, note today's date
3. **Do the work** — create/update specs in `current/`, write code, ship
4. **Update on completion** — move status to `✅`, update scorecard if metrics changed
5. **Log the release** — add entry to `releases.yaml`
6. **Capture learnings** — update relevant domain file with new understanding

### Status Emoji

| Emoji | Meaning |
|-------|---------|
| 🔨 | Actively working |
| ⏳ | Waiting / blocked |
| ✅ | Complete |
| 📋 | Planned, not started |
| 🔄 | In progress, paused |

### Domains

Domain files track our evolving understanding of business questions. Each has:
- **Current Understanding** — what we know or believe
- **Open Questions** — what we need to answer
- **Data Sources** — where answers might come from

### Work Plans

`../work-plans/todo/` holds detailed implementation plans for larger efforts. When complete, move to `../work-plans/completed/`.

### Proof Points

The proof-points document shows how our work stacks — each layer enables the next. This prevents working on Layer 4 optimization when Layer 1 data foundation isn't solid.

## Principles

- **Specs describe reality** — update them when shipping, not before
- **Open questions are valuable** — mark unknowns explicitly with `[ ]`
- **Source of truth matters** — every piece of data should have one canonical source
- **Metrics without baselines are useless** — always capture the "before" number
