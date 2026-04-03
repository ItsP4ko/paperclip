# Coding Conventions

**Analysis Date:** 2026-04-03

## Naming Patterns

**Files:**
- TypeScript source files use `kebab-case`: `company-routes.ts`, `issue-assignment-wakeup.ts`
- React component files use `PascalCase`: `IssueRow.tsx`, `AgentConfigForm.tsx`
- Test files co-located with source, same name + `.test.ts` / `.test.tsx`: `inbox.ts` → `inbox.test.ts`
- React hooks use `camelCase` with `use` prefix: `useInboxBadge.ts`, `useCompanyPageMemory.ts`
- E2E specs use `.spec.ts` suffix: `onboarding.spec.ts`, `docker-auth-onboarding.spec.ts`
- Server test files go in `__tests__/` subdirectory: `server/src/__tests__/log-redaction.test.ts`

**Functions:**
- Named exports with camelCase: `computeInboxBadgeData`, `applyCompanyPrefix`, `parseAssigneeValue`
- Service factories use camelCase with `Service` suffix: `issueService(db)`, `agentService(db)`
- Route factory functions use camelCase with `Routes` suffix: `issueRoutes(db, storage)`, `agentRoutes(db)`
- Internal helpers inside service factories are plain `function` declarations (not exported)
- Assertion helpers prefixed with `assert`: `assertCompanyAccess`, `assertCanManageIssueApprovalLinks`

**Variables:**
- camelCase for all variables and constants
- SCREAMING_SNAKE_CASE for module-level constant values: `MAX_ATTACHMENT_BYTES`, `RECENT_ISSUES_LIMIT`, `DISMISSED_KEY`
- Named Set constants for enum-like values: `FAILED_RUN_STATUSES = new Set([...])`, `BOARD_ROUTE_ROOTS = new Set([...])`

**Types:**
- `interface` for object shapes that represent entities or props: `IssueFilters`, `IssueRowProps`, `AssigneeSelection`
- `type` for unions, primitives, and computed types: `InboxTab = "mine" | "recent" | "unread" | "all"`, `UiMode = "none" | "static" | "vite-dev"`
- Internal types (not exported) declared at the top of the module using plain `type` alias: `IssueRow`, `IssueWithLabels`
- Props types named as `{ComponentName}Props`: `IssueRowProps`, `AgentConfigFormProps`
- Discriminated unions use `kind` field: `InboxWorkItem` with `kind: "issue" | "approval" | "failed_run" | "join_request"`

## Code Style

**Formatting:**
- No Prettier or Biome config detected at root; formatting is enforced by TypeScript strict mode and convention
- 2-space indentation (observed throughout)
- Single quotes for strings in most contexts, double quotes for JSX attributes and some server code
- Trailing commas in multi-line arrays and objects

**TypeScript Configuration:**
- `strict: true` in `tsconfig.base.json` — no implicit any, strict null checks
- `target: "ES2023"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- `isolatedModules: true` — each file must be independently type-checkable
- Explicit `.js` extensions required on relative imports in server/packages (NodeNext): `import { foo } from "./bar.js"`
- UI uses `@/` alias for `src/` (configured in `vitest.config.ts` and presumably vite config): `import { Link } from "@/lib/router"`

**Linting:**
- ESLint present (evidenced by `// eslint-disable` comments)
- Common suppressions: `@typescript-eslint/no-explicit-any`, `react-hooks/exhaustive-deps`
- Prefer `eslint-disable-next-line` scoped to specific lines, not file-level disables

## Import Organization

**Order (observed pattern):**
1. Node built-ins with `node:` prefix: `import fs from "node:fs"`, `import path from "node:path"`
2. Third-party packages: `import express from "express"`, `import { z } from "zod"`
3. Internal workspace packages (`@paperclipai/*`): `import type { Db } from "@paperclipai/db"`
4. Relative imports from same package: `import { validate } from "../middleware/validate.js"`

**Path Aliases (UI):**
- `@/` maps to `ui/src/` — used exclusively in UI package
- Example: `import { Link } from "@/lib/router"`, `import { queryKeys } from "@/lib/queryKeys"`

**Type Imports:**
- Use `import type` for type-only imports: `import type { Db } from "@paperclipai/db"`
- Value and type imports can be mixed: `import { Router, type Request, type Response } from "express"`

## Error Handling

**Server (Express):**
- Centralized error handler in `server/src/middleware/error-handler.ts` catches all thrown errors
- Throw `HttpError` subclass errors from route/service code; they are caught by the error handler
- Factory functions in `server/src/errors.ts` for common HTTP errors:
  ```typescript
  throw notFound("Issue not found");        // 404
  throw conflict("Duplicate entry");         // 409
  throw forbidden("Access denied");          // 403
  throw unauthorized();                      // 401
  throw unprocessable("Invalid state");      // 422
  throw badRequest("Missing field", details);// 400
  ```
- Zod validation errors auto-handled by error middleware → 400 with `details`
- Use `validate(schema)` middleware to parse and validate request bodies before handlers
- Route handlers wrap only specific async sections in try/catch when partial failure is acceptable; otherwise errors propagate to the error handler

**Client (UI):**
- `api/client.ts` throws `ApiError` for non-2xx responses
  ```typescript
  class ApiError extends Error {
    status: number;
    body: unknown;
  }
  ```
- Callers check `instanceof ApiError` or use React Query error states
- LocalStorage access always wrapped in try/catch with silent fallbacks

## Logging

**Framework:** Custom logger in `server/src/middleware/logger.ts` (imported as `{ logger }`)

**Patterns:**
- Import logger at module level: `import { logger } from "../middleware/logger.js"`
- Log redaction applied to user-sensitive data before logging: `server/src/log-redaction.ts`
- `httpLogger` middleware handles HTTP request/response logging centrally
- No `console.log` in production server code (use `logger`)

## Comments

**When to Comment:**
- Inline comments for non-obvious behavior: `// Backward compatibility for older drafts`
- TODO comments are rare and scoped with context: `// TODO(issue-worktree-support): re-enable this UI once the workflow is ready to ship`
- Block comments for E2E tests to explain test scope and mode flags (see `tests/e2e/onboarding.spec.ts`)
- Comments for eslint disable must name the rule being suppressed

**JSDoc/TSDoc:**
- Not commonly used on individual functions
- Types and interfaces are self-documenting through names and properties

## Function Design

**Size:** Services and routes can be long (1000–4000 lines), but individual functions are typically short and focused

**Parameters:**
- Named object parameters for functions with 3+ args: `function resolveGitWorktreeAddArgs({ branchName, targetPath, branchExists, startPoint })`
- Primitive args for simple utility functions: `function groupBy<T>(items: T[], keyFn: (item: T) => string)`
- `Partial<T>` for optional overrides pattern: `function makeIssue(overrides: Partial<Issue> = {})`

**Return Values:**
- Return `null` (not `undefined`) when no result: `return null;`
- Avoid returning bare `undefined`; use `null` for explicit absence
- Async functions always return `Promise<T>`

## Module Design

**Exports:**
- Named exports only — no default exports
- Group related exports in a single file
- Internal helpers are unexported (module-private)
- Service factories return an object of methods: `export function issueService(db: Db) { return { getById, create, update, ... }; }`

**Barrel Files:**
- Each domain directory has an `index.ts` that re-exports from sub-modules: `server/src/services/index.ts`, `server/src/middleware/index.ts`
- `packages/shared/src/index.ts` re-exports all shared types and validators

**Workspace Package Naming:**
- All internal packages use `@paperclipai/` scope: `@paperclipai/shared`, `@paperclipai/db`, `@paperclipai/ui`

---

*Convention analysis: 2026-04-03*
