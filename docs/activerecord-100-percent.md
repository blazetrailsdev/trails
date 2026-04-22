# ActiveRecord: Road to 100%

Current: **91.5% API** (2,578 / 2,819 methods). **97.1% inheritance** (204 / 210).

```bash
pnpm run api:compare -- --package activerecord
pnpm run api:compare -- --package activerecord --missing      # missing methods per file
pnpm run api:compare -- --package activerecord --inheritance  # inheritance mismatches
```

## How to work on this

Each area below is independent. Pick an area, work in a worktree, submit a PR.

**Before starting**: read the Rails source for the feature you're implementing.

**Measuring progress**: `api:compare` matches individual public methods against
Rails source. Methods must live in the file api:compare expects (matching the
Rails module structure).

---

## Infrastructure concerns

These affect multiple files and need dedicated work before more methods can
be properly wired up.

### Wire module methods onto Base

Methods in `persistence.ts`, `core.ts`, `model-schema.ts`, `scoping.ts` are
exported as standalone functions but not yet mixed onto `Base` as static/instance
methods. `api:compare` finds them in the correct files, but they're not callable
at runtime (e.g., `User.build()`, `User.currentRole()`).

**Fix:** Use the `include()` pattern from `@blazetrails/activesupport` to mix
class methods onto `Base`, similar to how `Relation` includes its modules.

### TypeCaster::Map

`core.ts#typeCaster` currently returns an ad-hoc object that reads from
`_attributeDefinitions`. Rails returns `TypeCaster::Map.new(self)`, a proper
class that delegates to the full type system and memoizes per class.

**Fix:** Implement `TypeCaster::Map` and memoize per class.

### Reflection foreignKey + CPK

`foreignKey` derivation does not yet handle composite primary keys or
`queryConstraints`. Associations with CPK will report incorrect foreign
keys in reflection.

---

## Remaining module files

Files with methods still missing. Run `api:compare --missing` to see per-method gaps.

| File                    | Matched | Missing | %   |
| ----------------------- | ------- | ------- | --- |
| store.rb                | 7       | 5       | 58% |
| inheritance.rb          | 8       | 4       | 67% |
| autosave_association.rb | 6       | 3       | 67% |
| counter_cache.rb        | 5       | 1       | 83% |

## Bigger gaps (not in scope yet)

| Area                | Notes                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| Connection adapters | Abstract adapter / schema statements / pool / transaction still have missing bits |
| Associations        | Builders, preloader, and join_dependency still have major gaps                    |
| Migration           | Command recorder, schema migration                                                |
