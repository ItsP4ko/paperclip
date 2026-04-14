# Git Workflow — Paperclip

## Branch structure (Gitflow)

```
Master  ──── v1.0 ──────────── v1.1 ──────────────────────────── v1.2
               ↑                 ↑                                  ↑
Hotfix         └─── (fix) ───────┘                                  │
                         ↘                                          │
Developer ───────────────────────────────────────── Release ────────┘
               ↑               ↑          ↑
Feature        └── commit ── commit ──────┘
```

- **master** — production. Only receives merges from `hotfix` or `release`.
- **developer** — main integration branch. All new work lands here.
- **feature/...** — work branches, created from `developer` and merged back to `developer`.
- **release/...** — cut from `developer` when features are ready, merges into `master` (with version tag) and back into `developer`.
- **hotfix/...** — cut from `master` for urgent fixes, merges into `master` AND `developer`.

---

## Workflow when receiving tickets

1. Group related tickets into a single feature.
2. Create branch from `developer`:
   ```
   Feature/(ticket-name-or-names)
   ```
3. Work on the feature branch with atomic commits.
4. When opening a PR to `developer`, the merge commit must follow this format:
   ```
   Feature/(branch-name): brief description
   ```

---

## Commit and PR rules

- **Commits on feature branches**: descriptive, lowercase, format `type: description`
- **Merge to developer**: `Feature/(branch-name): brief description`
- **Merge to master**: only from `release/x.x.x` or `hotfix/...`
- Never commit directly to `master` or `developer`

---

## Branching decision rule (MANDATORY — apply automatically)

When the user asks me to implement or fix something, I must pick the branch type **before writing any code**:

| Change type | Branch from | PR target | Branch name format |
|---|---|---|---|
| New feature / non-trivial work | `developer` | `developer` | `feature/(description)` |
| Minimal fix / hotfix (1-3 files, no new features) | `master` | `master` | `hotfix/(description)` |

- After committing, **always push the branch and open a GitHub PR** in the same step.
- PR title format: `hotfix/(branch-name): brief description` or `Feature/(branch-name): brief description`.
- Do not ask the user which type to use — infer it from the scope of the change.

---

## Version bumps (MANDATORY)

When making changes to the **server** or **cli** packages, bump the `version` field in the corresponding `package.json` before committing:

- **server** → `server/package.json` (`@paperclipai/server`)
- **cli** → `cli/package.json` (`relaycontrol`)

Use `patch` bumps (e.g. `0.6.4` → `0.6.5`) unless the change is a new feature (`minor`) or breaking (`major`). This ensures Docker rebuilds and npm publishes pick up the new version.
