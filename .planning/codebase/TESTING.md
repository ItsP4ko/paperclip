# Testing Patterns

**Analysis Date:** 2026-04-03

## Test Framework

**Runner:**
- Vitest ^3.0.5
- Root config: `vitest.config.ts` (workspace mode, delegates to per-package configs)
- Per-package configs: `ui/vitest.config.ts`, `server/vitest.config.ts`, `cli/vitest.config.ts`, `packages/db/vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`) — same API as Jest

**Run Commands:**
```bash
pnpm test              # Watch mode (all packages)
pnpm test:run          # Run all tests once (CI mode)
pnpm test:e2e          # E2E tests via Playwright
pnpm test:e2e:headed   # E2E tests with browser visible
pnpm test:release-smoke # Release smoke tests via Playwright
```

## Test File Organization

**Location:**
- Unit/integration tests: co-located with source files
  - `ui/src/lib/inbox.ts` → `ui/src/lib/inbox.test.ts`
  - `ui/src/components/IssueRow.tsx` → `ui/src/components/IssueRow.test.tsx`
  - `ui/src/context/LiveUpdatesProvider.tsx` → `ui/src/context/LiveUpdatesProvider.test.ts`
- Server tests: in `server/src/__tests__/` subdirectory
  - `server/src/__tests__/log-redaction.test.ts`
  - `server/src/__tests__/monthly-spend-service.test.ts`
- Package tests: co-located in `packages/*/src/*.test.ts`
  - `packages/db/src/client.test.ts`
  - `packages/adapter-utils/src/billing.test.ts`
- CLI tests: in `cli/src/__tests__/` subdirectory
  - `cli/src/__tests__/worktree.test.ts`
- E2E tests: `tests/e2e/*.spec.ts`
- Release smoke tests: `tests/release-smoke/*.spec.ts`

**Naming:**
- Unit tests: `{source-file}.test.ts` or `{source-file}.test.tsx`
- E2E/smoke tests: `{feature}.spec.ts`
- Server tests in `__tests__/`: named for the module being tested, e.g. `log-redaction.test.ts`

**Structure:**
```
ui/src/
  lib/
    inbox.ts
    inbox.test.ts          # co-located
  components/
    IssueRow.tsx
    IssueRow.test.tsx      # co-located
  context/
    LiveUpdatesProvider.tsx
    LiveUpdatesProvider.test.ts
server/src/
  __tests__/
    log-redaction.test.ts
    monthly-spend-service.test.ts
packages/db/src/
  client.ts
  client.test.ts
tests/
  e2e/
    onboarding.spec.ts
    playwright.config.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("module/feature name", () => {
  beforeEach(() => {
    // reset shared state
  });

  afterEach(() => {
    // cleanup
  });

  it("describes what the test proves in plain English", () => {
    // arrange
    // act
    // assert
  });
});
```

**Patterns:**
- `describe` names describe the module or feature area: `"inbox helpers"`, `"assignee selection helpers"`, `"log redaction"`, `"worktree helpers"`
- `it` names describe the observable behavior in human language, not implementation: `"counts the same inbox sources the badge uses"`, `"redacts standalone username mentions without mangling larger tokens"`
- No nested `describe` blocks in most tests; flat structure preferred
- `beforeEach` / `afterEach` used for state isolation (localStorage, process.cwd, process.env)

## Mocking

**Framework:** Vitest's built-in `vi` mock utilities

**Patterns:**
```typescript
// Module-level mock (replaces entire module)
vi.mock("@/lib/router", () => ({
  Link: ({ children, className, ...props }: React.ComponentProps<"a">) => (
    <a className={className} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/", search: "", hash: "" }),
  useNavigate: () => () => {},
}));

// Hoisted mock (for variables needed inside vi.mock factory)
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const cp = await importOriginal<typeof import("node:child_process")>();
  return {
    ...cp,
    spawn: (...args: Parameters<typeof cp.spawn>) => mockSpawn(...args),
  };
});

// Spy on method
const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
homedirSpy.mockRestore(); // restore in finally block

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

**What to Mock:**
- Router/navigation hooks in UI component tests (`@/lib/router`)
- `node:child_process.spawn` for process-spawning tests
- OS methods (`os.homedir`) when testing path resolution
- The `@mdxeditor/editor` in rich text component tests (complex third-party UI)
- DB queries by creating stub db objects with chained method mocks: `{ select: vi.fn(() => chain) }`

**What NOT to Mock:**
- Pure utility functions under test — test them directly
- The full service layer — use real service functions with stubbed DB
- Database schemas — test against real embedded Postgres when possible (`describeEmbeddedPostgres`)

## Fixtures and Factories

**Test Data:**
Factory functions are the standard pattern for creating test entities. All factories accept `Partial<T>` overrides:

```typescript
function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    companyId: "company-1",
    title: "Inbox item",
    status: "todo",
    priority: "medium",
    // ... all required fields with sensible defaults ...
    createdAt: new Date("2026-03-11T00:00:00.000Z"),
    updatedAt: new Date("2026-03-11T00:00:00.000Z"),
    ...overrides,
  };
}

// Specialized factories for specific scenarios
function makeApprovalWithTimestamps(id: string, status: Approval["status"], updatedAt: string): Approval {
  return { ...makeApproval(status), id, createdAt: new Date(updatedAt), updatedAt: new Date(updatedAt) };
}
```

**Common factory pattern:**
- Factory functions named `make{EntityType}` or `create{EntityType}`
- Always provide all required fields
- Use spread + overrides pattern: `{ ...defaults, ...overrides }`
- Use fixed ISO dates (`"2026-03-11T00:00:00.000Z"`) for deterministic time-based assertions

**Location:**
- Factories defined inline at the top of each test file — no shared fixture files detected
- `ui/src/fixtures/` directory exists but contains UI-specific mock data for storybook/dev, not test factories

## Coverage

**Requirements:** Not enforced — no coverage threshold config detected

**View Coverage:**
```bash
# Not explicitly configured; run with vitest coverage flags
pnpm vitest run --coverage
```

## Test Types

**Unit Tests (vitest):**
- Scope: Pure functions, utilities, lib helpers, adapter parsers, service logic
- Files: `ui/src/lib/*.test.ts`, `packages/*/src/*.test.ts`, `server/src/__tests__/*.test.ts`
- No external dependencies; fast, isolated

**Integration Tests (vitest):**
- Scope: Services against real embedded Postgres, CLI commands against real filesystem
- Key example: `packages/db/src/client.test.ts` — runs actual DB migrations against embedded Postgres
- Uses `describe.skip` when environment doesn't support the feature:
  ```typescript
  const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;
  ```
- Timeouts extended for slow operations: `it("...", async () => { ... }, 20_000)`
- `afterEach` cleanups using `cleanups` array pattern:
  ```typescript
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }
  });
  ```

**Component Tests (vitest + jsdom/node):**
- Scope: React components rendered via `createRoot` + `act`, not React Testing Library
- Environment declared per-file via comment: `// @vitest-environment jsdom` or `// @vitest-environment node`
- Default environment for UI package: `node` (set in `ui/vitest.config.ts`)
- Render without React Testing Library — use raw DOM APIs:
  ```typescript
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<MyComponent />); });
  const el = container.querySelector("[data-testid='foo']");
  act(() => { root.unmount(); });
  ```
- `IS_REACT_ACT_ENVIRONMENT = true` set globally in component test files:
  ```typescript
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  ```

**SSR/Static Rendering Tests:**
- Use `renderToStaticMarkup` from `react-dom/server` to test server-rendered HTML:
  ```typescript
  const html = renderToStaticMarkup(<ThemeProvider><MyComponent /></ThemeProvider>);
  expect(html).toContain("<strong>world</strong>");
  ```

**E2E Tests (Playwright):**
- Framework: Playwright ^1.58.2
- Config: `tests/e2e/playwright.config.ts`
- Browser: Chromium only
- Base URL: configured via `PAPERCLIP_E2E_PORT` env var (default 3100)
- Server auto-started via `webServer` config using `pnpm paperclipai run`
- Reuses existing server in non-CI environments: `reuseExistingServer: !process.env.CI`
- LLM-dependent assertions gated by `PAPERCLIP_E2E_SKIP_LLM` env var
- Uses `page.request.get()` for API validation after UI interactions

## Common Patterns

**Async Testing:**
```typescript
// Standard async/await
it("applies pending migrations", async () => {
  const connectionString = await createTempDatabase();
  await applyPendingMigrations(connectionString);
  const state = await inspectMigrations(connectionString);
  expect(state.status).toBe("upToDate");
}, 20_000); // explicit timeout for slow operations

// Async error assertion
await expect(
  sql.unsafe(`INSERT ... duplicate ...`),
).rejects.toThrow();
```

**Error Testing:**
```typescript
// Throw assertion
expect(() => resolveWorktreeMakeTargetPath("name/with/slash")).toThrow(
  "Worktree name must contain only letters, numbers, dots, underscores, or dashes.",
);

// Async throw
await expect(someAsyncFn()).rejects.toThrow();

// Return value signals failure (ok: false pattern)
const result = await getQuotaWindows();
expect(result.ok).toBe(false);
expect(result.error).toContain("spawn codex ENOENT");
```

**Environment Isolation (CLI/DB tests):**
```typescript
const ORIGINAL_CWD = process.cwd();
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
```

**Filesystem Isolation (CLI tests):**
```typescript
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-test-prefix-"));
try {
  // ... test code using tempRoot ...
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
```

**localStorage Mocking (UI tests running in node):**
```typescript
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => { storage.clear(); },
  },
  configurable: true,
});

beforeEach(() => { storage.clear(); });
```

**Internal test utilities exported from source:**
- Some modules export `__testUtils` or similar for testing internals without exposing them publicly:
  ```typescript
  // LiveUpdatesProvider.tsx
  export const __liveUpdatesTestUtils = {
    invalidateActivityQueries,
    shouldSuppressActivityToastForVisibleIssue,
    buildRunStatusToast,
    closeSocketQuietly,
  };
  ```

---

*Testing analysis: 2026-04-03*
