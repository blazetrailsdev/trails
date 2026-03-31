# ActiveRecord: Road to 100%

Current state: **61.9%** tests (5,190 / 8,385 matched, 2,957 skipped). **70.8%** API (393/555 classes/modules). 5 misplaced. 0 misplaced tests.

```bash
pnpm run test:compare -- --package activerecord
pnpm run api:compare -- --package activerecord
```

## How to work on this

Each area below is independent — multiple agents can work on different
areas in parallel without conflicts. Pick an area, work in a worktree,
and submit a PR.

**Before starting**: read the Rails source for the feature you're implementing.
The test names tell you what behavior to implement, but the Rails source tells
you how.

**Measuring progress**: `test:compare` matches our `it()` test descriptions
against Rails test names. `api:compare` checks class/module existence by file
path. Both matter — tests prove behavior, API proves structure.

---

## Test Coverage by Area

340/342 test files matched. 5,190 tests passing, 2,957 skipped (waiting
for implementation), 1,038 missing (no test file counterpart yet).

The skipped tests represent the biggest opportunity — the test files and
names exist, they just need the implementation behind them unskipped.

### High-skip areas (most tests waiting for implementation)

| Test file area              | Passing | Skipped | Notes                         |
| --------------------------- | ------- | ------- | ----------------------------- |
| Adapters (PG/MySQL/Trilogy) | ~200    | ~1,200  | Blocked on adapter completion |
| Associations                | ~800    | ~400    | Complex association behaviors |
| Migration                   | ~150    | ~300    | Migration compatibility, DDL  |
| Fixtures                    | ~100    | ~200    | Fixture loading edge cases    |
| Encryption                  | ~100    | ~150    | Encrypted attribute behaviors |

### Missing test files (2 files)

Only 2 test files have no TypeScript counterpart at all — nearly complete
file coverage.

---

## API Surface: What's Done vs What's Left

See [activerecord-api-to-100.md](activerecord-api-to-100.md) for the full
API breakdown. Summary:

**Fully matched**: Associations (42), Abstract Adapter (38), PostgreSQL (35),
Types (16), Attribute Methods (12), SQLite3 (12), Fixtures (12), Adapter
Infrastructure (8), Validations (7), Scoping (5)

**Nearly complete**: Encryption (28/30), Relation (22/25), Migrations (22/40)

**Main gaps**: Reflection (10 missing), MySQL adapter (14 missing), Migration
compatibility versions (18 missing), Statement cache (7), Store (4)

---

## Misplaced (5 — fix these first)

These exist but are in the wrong file path:

| Current location                  | Expected location                           | Class/Module      |
| --------------------------------- | ------------------------------------------- | ----------------- |
| `adapters/postgresql-adapter.ts`  | `connection-adapters/postgresql-adapter.ts` | PostgreSQLAdapter |
| `adapters/mysql2-adapter.ts`      | `connection-adapters/mysql2-adapter.ts`     | Mysql2Adapter     |
| `encryption/cipher/aes256-gcm.ts` | `encryption.ts`                             | Cipher            |
| `errors.ts`                       | `validations.ts`                            | RecordInvalid     |
| `coders/column-serializer.ts`     | correct path but detected in wrong location | ColumnSerializer  |

---

## Strategy for moving the number

### Tests (fastest path to higher %)

1. **Unskip tests in passing areas** — associations, base, relation tests
   have many skipped tests where the implementation is close
2. **Implement features behind skipped adapter tests** — PG/MySQL tests
   are the largest skip pool
3. **Add missing test files** — only 2 files missing

### API (fastest path to higher %)

1. **Fix 5 misplaced** — free wins, just file moves
2. **Export missing modules** — many are implemented but not exported from
   the correct file path (persistence, querying, timestamp, etc.)
3. **Reflection** (10 classes) — high-value, used by association introspection
4. **Store** (4 classes) — self-contained, popular feature
5. **Migration compatibility** (18 classes) — mechanical but large

---

## Known architectural gaps

- **ScopeRegistry needs AsyncLocalStorage**: `ScopeRegistry` uses a
  process-global WeakMap, which means concurrent async scoping blocks on
  the same model can race. Rails uses thread-local storage for
  `current_scope`; the TS equivalent is `AsyncLocalStorage`. This matters
  for server contexts with concurrent requests.
