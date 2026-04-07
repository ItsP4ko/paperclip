# Codebase Concerns

**Analysis Date:** 2026-04-03

## Tech Debt

**Adapter utils shim layer:**
- Issue: `server/src/adapters/utils.ts` is a re-export shim that duplicates `buildInvocationEnvForLogs` with a runtime fallback check rather than importing the real function. The comment explains this exists because `@paperclipai/adapter-utils` does not yet export this function consistently across all consumer locations.
- Files: `server/src/adapters/utils.ts:37-75`
- Impact: Every call to `buildInvocationEnvForLogs` goes through a runtime capability check and manual fallback implementation. Creates confusion about canonical source of truth.
- Fix approach: Export `buildInvocationEnvForLogs` from `@paperclipai/adapter-utils` and remove the shim. The TODO comment documents this explicitly.

**Disabled worktree UI (feature shipped but UI gated off):**
- Issue: Worktree execution workspace UI is behind a hard-coded `false` constant with no runtime feature flag mechanism. The backend fully supports worktrees (`server/src/services/workspace-runtime.ts` has 2112 lines of implementation), but the UI config panels return `null`.
- Files: `ui/src/adapters/runtime-json-fields.tsx:6`, `ui/src/adapters/runtime-json-fields.tsx:63-65`
- Impact: Feature is invisible to users. The constant must be changed in source and redeployed — no way to enable per-environment or per-customer.
- Fix approach: Replace hard-coded `false` with an environment/config-driven flag. Enable the UI when ready.

**Disabled agent "Skills" tab:**
- Issue: The skills tab view for agents is commented out in `AgentDetail.tsx` with a `// TODO: bring back later` comment. The route code and breadcrumb logic for the view remain in the file as dead commented code.
- Files: `ui/src/pages/AgentDetail.tsx:771`
- Impact: Dead code accumulating in a 4078-line file. Intent is unclear.
- Fix approach: Either restore the tab when ready or delete the commented code.

**Hardcoded `claude_local` fallback in CLI import:**
- Issue: The `buildDefaultImportAdapterOverrides` function in the CLI uses a hardcoded `claude_local` adapter type for `process`-type agents imported via CLI. A TODO comment acknowledges this should be replaced with proper adapter selection in the import TUI.
- Files: `cli/src/commands/client/company.ts:383`
- Impact: Importing agents that used a non-claude adapter will silently assign them `claude_local` without user awareness.
- Fix approach: Add adapter selection to the import TUI as described in the TODO.

**`as any` casts in plugin host services:**
- Issue: `server/src/services/plugin-host-services.ts` uses `as any` repeatedly (16 occurrences in that file alone) when bridging between plugin SDK types and internal service types for `scopeKind`, event patterns, entity upsert, and goal updates. These bypass TypeScript's type system entirely.
- Files: `server/src/services/plugin-host-services.ts:525,532,540,549,552,570,572,778,789,795,821,828,842,925,926,935`
- Impact: Silent type mismatches can cause runtime errors. Any breaking change to the plugin SDK's type signatures will not be caught at compile time.
- Fix approach: Define proper discriminated union types or adapter interfaces that bridge SDK types to internal types without `as any`.

**`as any` for database type in index.ts:**
- Issue: `server/src/index.ts` passes `db as any` to every service factory call (8 occurrences). This is because the Drizzle `Db` type exported from `@paperclipai/db` has a version mismatch or structural incompatibility at the call site.
- Files: `server/src/index.ts:468,503,507,527,530,559,564,578,579`
- Impact: Loss of compile-time safety for all service instantiation at the application entry point.
- Fix approach: Fix the type exported from `@paperclipai/db` or add a proper type assertion with a comment explaining the structural mismatch.

**`any` type for `dbOrTx` in issue service:**
- Issue: `labelMapForIssues` and `activeRunMapForIssues` in `server/src/services/issues.ts` accept `dbOrTx: any` because Drizzle's transaction type is not easily typed separately from the full `Db` type.
- Files: `server/src/services/issues.ts:450,471,486`
- Impact: Functions passed a wrong object type at call sites would fail silently at runtime.
- Fix approach: Use Drizzle's `typeof db` or a union type for db/transaction objects.

## Known Bugs

**Silent plugin event bus failure swallowed:**
- Symptoms: `_pluginEventBus.emit()` errors are caught by an empty `.catch(() => {})` handler. If plugin event dispatch fails for any reason (plugin crash, serialization error), the failure is silently discarded.
- Files: `server/src/services/activity-log.ts:92`
- Trigger: Plugin event bus emit failure during activity logging.
- Workaround: Check plugin worker logs separately; no application-level visibility.

**`notifyHireApproved` failures silently discarded:**
- Symptoms: When a board user approves a hire, `notifyHireApproved()` is called with `.catch(() => {})`. If the adapter's `onHireApproved` hook throws, the error is dropped with no visibility.
- Files: `server/src/services/approvals.ts:164`, `server/src/routes/access.ts:2736`
- Trigger: Adapter hook failure during agent hire approval.
- Workaround: None — there is no retry or fallback path.

## Security Considerations

**Invite token entropy is low:**
- Risk: Company invite tokens are generated as 8 random bytes mapped to a 36-character alphabet (`[a-z0-9]`). This yields approximately 41 bits of entropy (`log2(36^8)`). Combined with a 10-minute TTL, this is acceptable but marginal for a security-sensitive operation.
- Files: `server/src/routes/access.ts:63-73`
- Current mitigation: 10-minute TTL (`COMPANY_INVITE_TTL_MS`), token is hashed before storage.
- Recommendations: Consider increasing suffix length from 8 to 16 characters for better entropy without breaking the UX of the invite URL.

**Secrets strict mode defaults to `false`:**
- Risk: `secretsStrictMode` defaults to `false` in config, meaning plain-text env values are accepted even when a secrets provider is configured. An operator who intends to enforce encrypted secrets must explicitly opt in.
- Files: `server/src/config.ts:97`, `server/src/services/secrets.ts`
- Current mitigation: Per-company secret provider is configurable; strict mode can be enabled via env var or config file.
- Recommendations: Document clearly in onboarding that strict mode should be enabled for production deployments.

**Plugin UI CORS wildcard in all environments:**
- Risk: Plugin UI static files are served with `Access-Control-Allow-Origin: *` unconditionally — there is no restriction to the application's configured allowed hostnames. This is noted in the source code as intentional for dev, but the same code path runs in production.
- Files: `server/src/routes/plugin-ui-static.ts:475`
- Current mitigation: Plugin UI files are static assets (JS/CSS/images); no credentials or cookies are included in these responses.
- Recommendations: Restrict ACAO to the configured `allowedHostnames` or the request origin for production deployments.

**Mermaid SVG rendered via `dangerouslySetInnerHTML`:**
- Risk: Mermaid-rendered SVG is injected directly into the DOM via `dangerouslySetInnerHTML`. Mermaid is configured with `securityLevel: "strict"` which mitigates known XSS vectors, but any bypass of Mermaid's sanitizer would result in XSS.
- Files: `ui/src/components/MarkdownBody.tsx:79`
- Current mitigation: `securityLevel: "strict"` in Mermaid initialization. SVG source comes from Mermaid's own renderer, not user input.
- Recommendations: Monitor Mermaid release notes for security advisories. Consider a future CSP that restricts inline SVG.

**`innerHTML` used for HTML entity decoding:**
- Risk: `IssueDetail.tsx` uses `document.createElement("textarea")` with `el.innerHTML = text` to decode HTML entities when copying issue content to clipboard. While a `textarea` element doesn't execute scripts, this pattern is broadly discouraged.
- Files: `ui/src/pages/IssueDetail.tsx:1053-1055`
- Current mitigation: `textarea` element prevents script execution. Only runs client-side on user action (copy button click).
- Recommendations: Replace with a pure-JS HTML entity decoder function or use the `DOMParser` API.

## Performance Bottlenecks

**Company import is a sequential loop of awaited DB calls:**
- Problem: `importBundle` in `company-portability.ts` iterates over all agents, projects, workspaces, and issues in sequential `for...of` loops, each containing multiple `await` calls to the database (create agent, set membership, set permission, materialize bundle, etc.). For large imports this is extremely slow.
- Files: `server/src/services/company-portability.ts:3561-4297` (the entire `importBundle` function body)
- Cause: No concurrency or batching — each entity is created serially.
- Improvement path: Batch independent operations with `Promise.all`, or at minimum parallelize across agents that have no dependency on each other.

**`heartbeat.ts` is a 4013-line monolith:**
- Problem: The heartbeat service file contains all agent run orchestration logic including execution, session management, workspace realization, compaction, budget enforcement, and task session cleanup. This creates a God object that is difficult to test, understand, or modify safely.
- Files: `server/src/services/heartbeat.ts`
- Cause: Organic growth without decomposition.
- Improvement path: Extract distinct concerns into separate service modules: `run-execution.ts`, `session-compaction.ts`, `workspace-realization.ts`, etc.

**No rate limiting on HTTP endpoints:**
- Problem: No rate-limiting middleware is applied globally to the Express API. Only the plugin secrets handler (`server/src/services/plugin-secrets-handler.ts:230`) has its own in-process sliding-window rate limiter.
- Files: `server/src/app.ts`
- Cause: Not implemented.
- Improvement path: Add `express-rate-limit` or equivalent middleware for authentication endpoints, invite acceptance, and other sensitive routes.

## Fragile Areas

**`startLocksByAgent` in-memory mutex:**
- Files: `server/src/services/heartbeat.ts:70`, `server/src/services/heartbeat.ts:273-287`
- Why fragile: The per-agent start lock is a module-level `Map<string, Promise<void>>`. In a multi-instance deployment (multiple server processes), this lock provides no cross-process exclusivity. A concurrent heartbeat start on two processes for the same agent would bypass the lock.
- Safe modification: The lock is correctly cleaned up after use. The `if (startLocksByAgent.get(agentId) === marker)` check prevents stale deletions.
- Test coverage: Tested in `server/src/__tests__/heartbeat-workspace-session.test.ts` but only for single-process behavior.

**`skillInventoryRefreshPromises` module-level map:**
- Files: `server/src/services/company-skills.ts:104`
- Why fragile: In-memory per-company refresh deduplication map. Same multi-process concern as agent start locks. Skills inventory refreshes concurrent across two processes would not be deduplicated.
- Safe modification: This is a best-effort deduplication optimization, not a correctness requirement. Duplicate refreshes are safe.
- Test coverage: Partial.

**`company-portability.ts` is a 4319-line file:**
- Files: `server/src/services/company-portability.ts`
- Why fragile: All export, import, preview, and validation logic in one file. Changes to any portability concern risk unintentional side effects. Functions are long with deep conditional nesting (import loop spans ~500 lines).
- Safe modification: Well-tested via `server/src/__tests__/company-portability.test.ts` (2187 lines of tests). Run tests before any change.
- Test coverage: High for export/import flows, but the test file itself uses 190+ `as any` casts indicating type coverage gaps.

**Plugin sandbox only covers CommonJS modules:**
- Files: `server/src/services/plugin-runtime-sandbox.ts:109-113`
- Why fragile: The VM sandbox (`loadPluginModuleInSandbox`) explicitly rejects ESM syntax with a `PluginSandboxError`. Plugin authors who write ESM worker entrypoints will get a confusing error. The plugin spec requires CJS, but the error surface for non-compliant plugins is poor.
- Safe modification: Do not change the ESM check without implementing full ESM sandbox support.
- Test coverage: Tested indirectly through plugin worker manager tests.

**Plugin event bus subscriptions accumulate across restarts:**
- Files: `server/src/services/plugin-host-services.ts:1122-1129`
- Why fragile: Event subscriptions must be cleaned up via `dispose()` on plugin stop/crash. If `dispose()` is not called (e.g., process killed, exception in cleanup path), subscriptions accumulate. There is a `SESSION_EVENT_SUBSCRIPTION_TIMEOUT_MS` safety-net timer but no equivalent for general event subscriptions.
- Safe modification: Always call `dispose()` in `pluginLifecycleManager` stop/crash handlers.
- Test coverage: The dispose path is covered in `server/src/__tests__/plugin-worker-manager.test.ts`.

## Scaling Limits

**Embedded PostgreSQL:**
- Current capacity: The default deployment mode uses embedded PostgreSQL (`pgsql` data directory in `~/.paperclip/`). Connection pooling is not configured — `createDb` uses the default `postgres` pool size.
- Limit: Single-machine, no horizontal scaling. Not suitable for multi-tenant cloud deployments.
- Scaling path: Config supports external PostgreSQL via `DATABASE_URL`. Switch to `databaseMode: "postgres"` in config file.

**In-memory plugin job store / event bus:**
- Current capacity: Plugin job scheduling and event pub/sub are backed by in-process data structures (`createPluginJobScheduler`, `createPluginEventBus`).
- Limit: State is lost on server restart. No cross-process coordination for multi-instance deployments.
- Scaling path: Persistent job queue (e.g., pg-based queue) and distributed event bus would be needed for multi-instance operation.

## Dependencies at Risk

**`better-auth` session provider:**
- Risk: `better-auth` is an authentication dependency that the codebase wraps at `server/src/auth/better-auth.ts`. Breaking API changes in this library would affect the entire authentication flow for `authenticated` deployment mode.
- Impact: Session resolution, user sign-in, sign-up all depend on this library.
- Migration plan: The `resolveSession` abstraction in `actorMiddleware` isolates session resolution to one integration point. A migration would only need to update `server/src/auth/better-auth.ts`.

**Mermaid rendering dependency:**
- Risk: Mermaid is lazily imported and renders SVG that is then injected via `dangerouslySetInnerHTML`. Breaking changes or security advisories in Mermaid affect all Markdown views that contain mermaid code blocks.
- Impact: Diagram rendering in issue descriptions, comments, and agent instructions.
- Migration plan: Mermaid is loaded lazily (`import("mermaid")`), so a future replacement would only need to update `ui/src/components/MarkdownBody.tsx`.

## Missing Critical Features

**No global HTTP rate limiting:**
- Problem: Authentication endpoints, invite acceptance, CLI auth challenges, and join request submission have no rate limiting at the HTTP layer. Only plugin secret resolution has an in-process rate limiter.
- Blocks: Brute-force resistance for authentication and token-based flows in production deployments.

**No cross-process locking for agent start coordination:**
- Problem: `startLocksByAgent` (in-memory mutex) prevents duplicate starts within a single server process, but provides no safety guarantee in multi-process deployments.
- Blocks: Horizontal scaling of the server tier. Currently safe because the deployment model is single-process.

## Test Coverage Gaps

**UI pages have zero unit test coverage:**
- What's not tested: All 41 page-level components in `ui/src/pages/` have no test files except one (`IssueDetail.tsx` — the single file result for `*.test.*` in pages/). All major pages (Inbox, AgentDetail, CompanySkills, RoutineDetail, Costs, etc.) have no automated unit or integration tests.
- Files: `ui/src/pages/` (entire directory, 41 files, ~30k lines of component code)
- Risk: UI regressions in major user flows (issue management, agent configuration, company export/import) go undetected until manual QA.
- Priority: High

**Plugin event bus and job coordinator integration:**
- What's not tested: The interaction between `plugin-event-bus.ts`, `plugin-job-coordinator.ts`, `plugin-job-scheduler.ts`, and the host services layer is tested only with coarse-grained integration tests. Failure modes (scheduler timeout, coordinator crash during job transition) are untested.
- Files: `server/src/services/plugin-event-bus.ts`, `server/src/services/plugin-job-coordinator.ts`, `server/src/services/plugin-job-scheduler.ts`
- Risk: Plugin jobs can silently get stuck in intermediate states on coordinator failures.
- Priority: Medium

**Company portability test uses 190+ `as any` casts:**
- What's not tested: The test file for company portability uses `as any` throughout test fixture construction, meaning type mismatches in the import/export manifest schema would not be caught by tests.
- Files: `server/src/__tests__/company-portability.test.ts`
- Risk: Schema changes to portability types could break imports/exports in ways that tests do not catch.
- Priority: Medium

---

*Concerns audit: 2026-04-03*
