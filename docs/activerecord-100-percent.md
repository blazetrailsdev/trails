# ActiveRecord: Road to 100%

Current state: **61.9%** tests (5,190 / 8,385 matched). **40.4%** API (1,147 / 2,839 methods).

```bash
pnpm run test:compare -- --package activerecord
pnpm run api:compare -- --package activerecord
pnpm run api:compare -- --package activerecord --missing  # show missing methods per file
```

## How to work on this

Each area below is independent. Pick an area, work in a worktree, submit a PR.

**Before starting**: read the Rails source for the feature you're implementing.

**Measuring progress**: `test:compare` matches our test descriptions against Rails test names. `api:compare` matches individual public methods against Rails source. Both matter.

---

## API: 52 fully matched files

Associations (join dependency, nested error, preloader batch), attribute methods (query, read, serialization, write), callbacks, schema creation, PostgreSQL OID types (11), database configs, delegated type, encryption (5), fixture set, locking, migration, model schema, scoping, signed ID, store, type (7), validations (7), and more.

## API: biggest gaps

| Area                | Missing methods | Notes                                                                       |
| ------------------- | --------------- | --------------------------------------------------------------------------- |
| Connection adapters | ~400            | Abstract adapter (92), schema statements, abstract mysql, pool, transaction |
| Associations        | ~120            | belongs_to (11), collection (15), builder (30), preloader (25)              |
| Relation            | ~100            | Query methods, calculations, spawn, merger, where clause                    |
| Core modules        | ~80             | Persistence, querying, attribute methods, nested attributes                 |
| Migration           | ~50             | Command recorder, schema migration                                          |

## Tests: high-skip areas

| Area                        | Passing | Skipped | Notes                         |
| --------------------------- | ------- | ------- | ----------------------------- |
| Adapters (PG/MySQL/Trilogy) | ~200    | ~1,200  | Blocked on adapter completion |
| Associations                | ~800    | ~400    | Complex association behaviors |
| Migration                   | ~150    | ~300    | Migration DDL                 |
| Fixtures                    | ~100    | ~200    | Fixture loading edge cases    |
| Encryption                  | ~100    | ~150    | Encrypted attribute behaviors |

## Known architectural gaps

- **ScopeRegistry needs AsyncLocalStorage**: uses a process-global WeakMap, which means concurrent async scoping blocks can race. Rails uses thread-local storage; the TS equivalent is `AsyncLocalStorage`.
- **Reflection foreignKey + CPK**: `foreignKey` derivation does not yet handle composite primary keys or `queryConstraints`. Associations with CPK will report incorrect foreign keys in reflection.
