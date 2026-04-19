# ActiveRecord Dependency Audit

An analysis of places in `packages/activerecord/src/` where we reimplement
functionality inline instead of using sibling packages, or use raw SQL strings
instead of Arel AST nodes.

## 1. Raw SQL Strings Instead of Arel

Places where high-level business logic constructs SQL via string interpolation
instead of using `@blazetrails/arel` (Table, SelectManager, InsertManager,
UpdateManager, DeleteManager, Nodes).

Most of the original list has been migrated to Arel (updateAll, deleteAll,
insertAll, whereAssociated, whereMissing, optimizer hints, destroy, reload,
lock!, HABTM eager-load, the delegated type tables). Remaining spots:

### base.ts

**Empty-row INSERT** (around line 2545) — used when `create` runs with no
attribute writers:

```typescript
sql = `INSERT INTO "${table.name}" ${emptyValue}`;
```

**\_performUpdate** (around line 2972):

```typescript
const sql = `UPDATE "${table.name}" SET ${setClauses} WHERE ${ctor._buildPkWhere(this.id)}`;
```

Both should route through `InsertManager` / `UpdateManager`.

### Lower priority: infrastructure files

`internal-metadata.ts`, `schema-migration.ts`, and `migration-runner.ts` still
use raw SQL for CREATE TABLE, SELECT, INSERT, DELETE on internal bookkeeping
tables. Rails uses Arel here too; low priority because these are not on the
hot request path.

---

## 2. ActiveSupport Utilities Not Used

The inline-inflection duplication in `relation.ts` / `nested-attributes.ts` /
`delegated-type.ts` / `enum.ts` / `delegate.ts` / `reflection.ts` has all
been removed. Those files now use `underscore` / `pluralize` / `singularize`
/ `camelize` / `classify` from `@blazetrails/activesupport`.

### blank / present checks

**attribute-methods.ts** — inline blank check:

```typescript
export function attributePresent(this: AttributeRecord, name: string): boolean {
  const value = this.readAttribute(name);
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}
```

Should use `isBlank()` / `isPresent()` from activesupport.

### Other available but unused ActiveSupport features

These are exported by activesupport and used by Rails' ActiveRecord but not
yet wired up in our implementation:

- **`HashWithIndifferentAccess`** — Rails uses this for attribute hashes
- **`Notifications`** — already used in a few places (`sql.active_record`);
  more sites could route through it (logging, instrumentation)
- **`Duration` / `TimeZone` / `TimeWithZone`** — timezone-aware attribute handling
- **`MessageEncryptor` / `MessageVerifier`** — our `encryption/` directory has
  its own crypto; Rails delegates to ActiveSupport
- **`CurrentAttributes`** — Rails uses this for request-scoped state
- **`MemoryStore` / `FileStore`** — query cache could use ActiveSupport::Cache
- **`Logger` / `BroadcastLogger`** — our logging could use ActiveSupport::Logger

---

## 3. ActiveModel Integration Status

ActiveModel integration is generally solid. Verified status:

- **Validators** — properly extend base classes from activemodel
  (`PresenceValidator`, `AbsenceValidator`, `LengthValidator`,
  `NumericalityValidator`, `EachValidator`)
- **Type system** — shared with activemodel (`Type`, `ValueType`,
  `StringType`, `IntegerType`, `BooleanType`, etc.)
- **Callbacks** — delegates to activemodel. `Base` extends `Model` from
  activemodel, which provides the callback chain. `callbacks.ts` registers
  AR-specific callbacks (beforeSave, afterSave, etc.) on that inherited chain.
- **Dirty tracking** — delegates to activemodel. `attribute-methods/dirty.ts`
  adds persistence-aware methods (`savedChangeToAttribute`,
  `attributeBeforeLastSave`) that read from activemodel's `previousChanges`
  and `changes` properties.
- **Errors** — `errors.ts` defines AR-specific error classes (`RecordNotFound`,
  `RecordInvalid`, `StatementInvalid`, etc.). This is correct — Rails does the
  same. AR error classes are distinct from `ActiveModel::Errors` (which tracks
  validation error messages on a record).
- **ActiveModel::Attribute** — arel now depends on activemodel (#626);
  `Arel::Nodes.buildQuoted` routes ActiveModel::Attribute instances through
  BindParam, matching Rails' `visit_ActiveModel_Attribute → add_bind` flow.

---

## Priority Order

1. **base.ts raw SQL** — the two remaining INSERT/UPDATE spots (empty-row
   insert, single-record save) should use Arel.
2. **`isBlank` / `isPresent`** — `attribute-methods.ts#attributePresent`
   should delegate to activesupport.
3. **ActiveSupport utilities** (HashWithIndifferentAccess, Duration/TimeZone,
   CurrentAttributes, Cache stores, Logger) — broader integration, each its
   own feature.
