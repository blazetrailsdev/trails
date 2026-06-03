# Test gates — adapter/feature conditionals in `test:compare`

> **What this is.** Rails runs many tests only under certain databases or DB
> features (`current_adapter?(:PostgreSQLAdapter)`, `skip unless
supports_json?`, the `adapters/<db>/` directory layout). We mirror that with
> `describeIfPg` / `describeIfSupports` / `it.skipIf`. `test:compare` now
> **extracts both sides' gates and flags where ours diverges from Rails'** — so
> a lazy `it.skip` (our TODO marker) can be told apart from a legitimate
> adapter/feature gate.
>
> **Snapshot (activerecord, 2026-06-02):** 524 gate-mismatches —
> **124 should-gate**, 336 missing-gate, 57 wrong-gate, 7 over-gated. Refresh
> with `pnpm test:compare --package activerecord --gates`.

This complements [`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md):
that doc drives `skipped → 0`; this one explains the gate machinery and how to
use it to convert TODO-skips into real gates (which moves the needle without
new implementation).

---

## 1. The helpers (how to gate a test)

Use these in `*.test.ts` exactly as Rails uses its conditionals. They decide at
**collection time** off `adapterType` (`"sqlite" | "postgres" | "mysql"`).

### Adapter gates — mirror Rails `current_adapter?` / `adapters/<db>/`

| Helper                                           | From                                             | Runs on                     |
| ------------------------------------------------ | ------------------------------------------------ | --------------------------- |
| `describeIfPg(name, fn)`                         | `adapters/postgresql/test-helper.ts`             | PostgreSQL only             |
| `describeIfMysql(name, fn)`                      | `adapters/abstract-mysql-adapter/test-helper.ts` | MySQL/MariaDB only          |
| `describeIfSqlite(name, fn)`                     | `adapters/sqlite3/test-helper.ts`                | SQLite only                 |
| `it.skipIf(adapterType === "mysql")(name, fn)`   | vitest builtin                                   | everywhere **except** mysql |
| `it.runIf(adapterType === "postgres")(name, fn)` | vitest builtin                                   | postgres only               |

### Feature gates — mirror Rails `supports_<feature>?`

`packages/activerecord/src/test-helpers/supports.ts`:

```ts
import { describeIfSupports, itIfSupports, adapterSupports } from "../test-helpers/supports.js";

itIfSupports("json", "round-trips a json column", async () => { … });   // skips where unsupported
describeIfSupports("comments", "CommentTest", () => { … });
if (adapterSupports("savepoints")) { … }                                // imperative check
```

- **Feature keys match Rails `supports_<key>?`** (and the gate extractor's
  keys), so a Rails `skip unless supports_json?` maps 1:1 to
  `itIfSupports("json", …)`.
- Support is resolved off `adapterType` for the CI matrix (postgres:17,
  mysql:8, in-memory sqlite) — the same idiom as
  `adapterType !== "mysql"` in `insert-all.test.ts`. The table mirrors **Rails'**
  `supports_<feature>?` (incl. its `mariadb?` / `database_version` branching).
  The CI lane switched from MariaDB 11 to MySQL 8 in #2897; `json` and
  `expression_index` now cover all three backends. The end state is to **power
  `adapterSupports` from the connected adapter** and drop this static table once
  every adapter capability is Rails-faithful.
- **An unknown feature key throws** — add it to the `SUPPORTS` table when a
  suite first gates on it.

Currently seeded (`SUPPORTS` in `supports.ts`):

| key                                               | runs on          | note                                                                           |
| ------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `savepoints`, `foreign_keys`, `check_constraints` | all three        |                                                                                |
| `json`                                            | all three        | `!mariadb? && >= 5.7.8` — MySQL 8 qualifies; was postgres/sqlite (MariaDB CI)  |
| `comments`                                        | postgres, mysql  | SQL COMMENT ON — not SQLite                                                    |
| `concurrent_connections`                          | postgres, mysql  | in-memory SQLite can't run concurrently                                        |
| `insert_conflict_target`                          | postgres, sqlite | MySQL has no `ON CONFLICT (target)`                                            |
| `advisory_locks`                                  | postgres, mysql  | abstract default false → not SQLite                                            |
| `exclusion_constraints`, `unique_constraints`     | postgres         | PostgreSQL only                                                                |
| `expression_index`                                | all three        | `!mariadb? && >= 8.0.13` — MySQL 8 qualifies; was postgres/sqlite (MariaDB CI) |

> Adding a key: verify the cell against the vendored Rails
> `supports_<key>?` for pg17 / mysql:8 / recent sqlite before adding it.

---

## 2. The output (what the tooling produces and how to read it)

### The `gate` field

Both extractors emit a `gate` per test into their manifests
(`scripts/test-compare/output/{rails,ts}-tests.json`):

```jsonc
{ "adapters": ["postgresql"], "features": ["json"], "guards": ["mariadb"], "source": ["dir"] }
```

- `adapters` — the positive set the test runs on. **Absent = all** (runs
  everywhere). **`[]` = runs nowhere** (contradictory gates, kept distinct from
  absent). **All three present** is treated as unconditional.
- `features` — required `supports_<key>?` keys.
- `guards` — recognized-but-not-comparable conditions (`mariadb`, `version`,
  `in_memory_db`, `always_skip`, `unknown`). Informational only.
- `source` — where the gate came from. Ruby: `dir` / `class` / `body-skip`.
  TS: `wrapper` (a `describeIf*` suite) / `test` (an inline `it.skipIf`).
  `pending` (an `it.skip`/`it.todo` TODO) is **not** a gate — it's tracked
  separately.

The comparison compares **only adapters + features** across sides (guards and
source use different vocab Ruby↔TS, so they don't drive mismatches).

### The `--gates` report

`pnpm test:compare --package activerecord --gates` prints, per file:

```
  GATE MISMATCHES (Rails gate vs our TS gate):
    [should-gate] "connection in local time"
        rails: adapters=[mysql,postgresql,sqlite] guards=[in_memory_db]   ts: unconditional
    [missing-gate] "count selected arel attributes"
        rails: adapters=[mysql]   ts: unconditional
    [wrong-gate] "changing columns"
        rails: features=[bulk_alter]   ts: adapters=[postgresql]
```

The four kinds:

| Kind             | Meaning                                   | Action                                                                                                                                                                                      |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **should-gate**  | Rails gates it; we `it.skip` it as a TODO | Usually an **unimplemented-feature stub**, not a flip-to-gate win — implementation guidance, not a mechanical convert (see §3.2). Only gate it if the body is real + passes on the adapter. |
| **missing-gate** | Rails gates it; we run it unconditionally | Decide: if our impl passes on every backend, leave it (benign — we're more portable); if it would misbehave on the adapter Rails excludes, add the gate.                                    |
| **wrong-gate**   | both gate it, to **different** sets       | Reconcile. Often we gated by adapter where Rails gates by feature — switch to `itIfSupports("<feature>")`, or fix the adapter set.                                                          |
| **over-gated**   | Rails runs it everywhere; we gate it      | Remove our gate, or confirm we genuinely need to restrict it.                                                                                                                               |

The summary line carries the count (also visible in CI):

```
  activerecord — 6999/7832 tests (89.4%) (833 skipped, 524 gate-mismatch (see --gates))
```

### In CI

The **Rails API/Test Comparison** job (`.github/workflows/ci.yml`):

- _Extract Ruby tests_ and _Test comparison_ steps print the gated counts
  (`… (N adapter/feature-gated)`).
- _Test comparison_ runs with `--gates`, so the per-test breakdown above prints
  inline in the log.
- **Advisory — never fails the job.** Gate mismatches are not wired to the exit
  code; CI stays green regardless.

---

## 3. How to use it — and how to mark a file complete

Per file (or cluster), iterate the `--gates` report until it's clean:

1. **Run** `pnpm test:compare --package activerecord --gates` (refresh
   manifests first if stale — drop `--cached`).
2. **should-gate** → **check the `it.skip` body first.** Empirically ~all
   should-gate `it.skip`s are **unimplemented-feature / infra stubs**
   (`BLOCKED: … not implemented / requires fixtures / DDL API`), _not_ tests
   skipped purely for the wrong adapter. Converting a stub to a gate just creates a vacuously-
   or spuriously-passing fake test — **don't**. Only convert when the body is a
   real, passing test that was skipped for adapter applicability (rare). For the
   stubs, should-gate is **implementation-time guidance**: when you build the
   feature, gate it the way Rails does. (Empirically ~120/124 of the AR
   should-gate items in the current run are stubs of this kind — the body is a
   `BLOCKED: … not implemented` / `requires fixtures` comment.)
3. **wrong-gate** → make our gate equal Rails', **mirroring Rails' mechanism**:
   if Rails gates by `supports_X?`, use `itIfSupports("X")` (not an adapter
   check); add the key to `SUPPORTS` if missing (verify vs vendored Rails).
   - **Lane-preserving subset is the safe, first cleanup**: when our adapter set
     already equals the capability's lanes, the swap is zero-runtime-change —
     only the expression aligns. Verify on the real backend(s) the capability
     runs on (PG/MariaDB via docker — see §8 of the adapter-test-ci plan).
   - **Not all are lane-preserving.** If our gate is _narrower_ than Rails'
     (e.g. `bulk_alter`/`transaction_isolation`), converting enables new lanes →
     verify the body passes there; it may surface a real impl gap (defer).
   - **If Rails gates by `current_adapter?`, mirror that, not a capability**
     (e.g. the MySQL-only `expression indices escaping` test stays an adapter
     gate). Don't force a capability gate where Rails doesn't use one.
4. **missing-gate** → judgment call. Run the test under the adapter Rails
   excludes; if green, leave it un-gated (note it — we're legitimately more
   portable). If red or semantically different, add the gate.
5. **over-gated** → drop our gate unless there's a real reason; if there is,
   it's a Rails-side gap worth a note.
6. **Re-run** and confirm the file's mismatch lines are gone.

**Definition of complete (per file):** zero `gate-mismatch` entries in the
`--gates` report for that file. **Series complete:** `grandGateMismatch → 0`
across activerecord — every Rails-gated test we match is gated equivalently (or
deliberately, documented, left un-gated for a portability reason).

> Tip: the **lane-preserving wrong-gate** conversions are the cheapest real win
> — pure test-file edits, zero behavior change (see step 3). `should-gate` items
> _look_ cheap but are almost always unimplemented stubs (step 2); genuine
> adapter-applicability skips are rare, so verify the body passes on the target
> adapter before converting one.

---

## 4. Where the code lives

| Concern                                                         | File                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Feature-gate helpers + `SUPPORTS` registry                      | `packages/activerecord/src/test-helpers/supports.ts`                           |
| Adapter-gate wrappers                                           | `adapters/{postgresql,abstract-mysql-adapter,sqlite3}/test-helper.ts`          |
| Ruby gate extraction (`current_adapter?` / `skip unless` / dir) | `scripts/test-compare/extract-ruby-tests.rb`                                   |
| TS gate extraction (`describeIf*` / `itIfSupports` / `skipIf`)  | `scripts/test-compare/extract-ts-core.ts`                                      |
| Gate model + merge + mismatch classifier                        | `scripts/test-compare/gates.ts`                                                |
| Comparison wiring + `--gates` report                            | `scripts/test-compare/test-compare.ts`                                         |
| Shipped in                                                      | #2856 (Ruby + `TestGate` + helper), #2880 (TS extraction), #2884 (diagnostics) |
