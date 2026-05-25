# How AGENTS.md and CLAUDE.md Work

This repo uses **AGENTS.md** as the single source of truth for agent context, and **CLAUDE.md** as a one-line pointer that imports it. This file explains why and how.

## The two filenames

| File | Audience | What it contains |
|------|----------|------------------|
| `AGENTS.md` | Agent-neutral convention (Codex, Cursor, OpenAI agents, etc.) | All project context, rules, conventions, commands |
| `CLAUDE.md` | Claude Code specifically (auto-loaded into context) | One line: `@AGENTS.md` |

Claude Code only auto-loads `CLAUDE.md`. Other tools look for `AGENTS.md`. The `@` import bridges the two so we don't duplicate content.

## The `@` import mechanism

Inside `CLAUDE.md` (and any file it transitively imports), the syntax `@path/to/file.md` causes Claude Code to **inline that file's contents into context at session start**. It's not a hint — it's mechanical inclusion, executed before the first turn.

### Key facts

- **Automatic & mandatory.** Once approved on first use, the import happens every session.
- **Inlined, not lazy.** Imported content enters the same context block as `CLAUDE.md`. No on-demand loading.
- **Path is relative to the file containing the import**, not the working directory. So `@AGENTS.md` inside `CLAUDE.md` (both at repo root) resolves correctly.
- **Recursive up to 5 hops.** `CLAUDE.md` → `@AGENTS.md` → `@specs/foo.md` → `@specs/bar.md` all chain in. Circular imports are detected and dropped.
- **Re-read every session.** No stale cache.
- **First-time import shows an approval dialog.** After approval, silent.
- **Imports inside fenced code blocks or inline backticks are NOT expanded** — they're treated as literal text. Useful when documenting the syntax itself.

### Where `@` imports work

| Surface | Supports `@`? |
|---|---|
| `CLAUDE.md` / `AGENTS.md` (project, user `~/.claude/`, managed policy) | ✅ Yes |
| Files transitively imported from those | ✅ Yes |
| `.claude/agents/*.md` (subagents) | ❌ No |
| `.claude/commands/*.md` (slash commands) | ❌ No |
| `SKILL.md` files | ❌ No |
| Plugin-provided agents / commands / skills | ❌ No |
| `settings.json` and other JSON config | ❌ No |
| User chat input `@filename` | Different mechanism — interactive file attachment, not at-load inlining |

**Implication:** the `@` chain is exclusive to the memory-file tree rooted at `CLAUDE.md`. Subagents, slash commands, and skills must inline content directly.

## How this repo is wired

```
CLAUDE.md  ──@──▶  AGENTS.md  ──(plain links)──▶  specs/current/*.md
                                                  specs/ops/*.md
                                                  specs/invariants/*.md
```

`CLAUDE.md` is one line: `@AGENTS.md`. Everything else lives in `AGENTS.md` and the `specs/` tree. Specs are loaded on demand per the context-loading table in `AGENTS.md` section 3 — not auto-imported, because doing so would burn context on rules that don't apply to the current task.

## Rules for editing

- **Add agent-facing rules and conventions to `AGENTS.md`**, not `CLAUDE.md`.
- **Don't put Claude-specific content in `AGENTS.md`** unless it's also useful to other agents. (If you ever need Claude-only instructions, replace the `@AGENTS.md` line in `CLAUDE.md` with `@AGENTS.md` followed by the Claude-only block.)
- **Don't move the import target.** If `AGENTS.md` is renamed or moved, update `CLAUDE.md`.

## Hard-load (`@import`) vs. context-loading table

Every new doc that an agent might need to consult has to go in one of two places:

1. **Hard-loaded** — added as `@path/to/doc.md` somewhere in the `CLAUDE.md → AGENTS.md` import chain. Inlined on every session, before turn 1, regardless of what the user is doing.
2. **On-demand via the context-loading table** — listed as a plain link in `AGENTS.md` §3 with a trigger phrase. Agent reads it only when the trigger fires.

Hard-loading costs context tokens on every session; on-demand costs an agent decision (and the risk it forgets to read). Pick deliberately.

| Hard-load when… | Use the context-loading table when… |
|---|---|
| The content applies to **every** session regardless of task | The content applies only to **specific task types** (schema changes, API routes, cron jobs) |
| It's **small** relative to its importance — invariants, glossary, critical rules | It's **large** — full spec docs, generated references, exhaustive enumerations |
| Violating it has **broad blast radius** (data loss, security, money, compliance) | Violating it has narrow blast radius and would be caught in review |
| It changes **how the agent thinks** about the project (mission, architecture, conventions) | It's reference material that's only meaningful in context |
| It's referenced **frequently across diverse tasks** | The trigger for needing it is **identifiable in advance** from the user's request |

### Examples in this repo

- **Hard-loaded** (lives directly in AGENTS.md): critical rules, session protocol, code conventions, database rules. Apply to every task.
- **On-demand** (linked from §3 context-loading table): `specs/current/schema.md`, `specs/current/routes.md`, `specs/invariants/attribution.md`. Only relevant when the task touches that area.

### When in doubt, prefer on-demand

The default should be a plain link in the context-loading table. Promote a doc to a hard-load only when on-demand has failed in practice — i.e., agents have skipped reading it and shipped bad work. Context budget is finite; spend it on rules that genuinely apply universally.

## Why not a symlink?

A symlink (`CLAUDE.md → AGENTS.md`) would also work and is even simpler — one physical file, both tools read identical bytes. We chose `@AGENTS.md` instead because:

1. It survives Windows checkouts (symlinks require admin or developer mode).
2. It leaves room to add Claude-specific lines later without affecting `AGENTS.md`.
3. The import is explicit and discoverable when reading the file.
