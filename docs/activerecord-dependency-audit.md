# ActiveRecord Dependency Audit

An analysis of places in `packages/activerecord/src/` where we reimplement
functionality inline instead of using sibling packages, or use raw SQL strings
instead of Arel AST nodes.

## 1. Raw SQL Strings Instead of Arel

These are places in high-level business logic that construct SQL via string
interpolation instead of using `@blazetrails/arel` (Table, SelectManager,
InsertManager, UpdateManager, DeleteManager, Nodes).

### relation.ts

**whereAssociated / whereMissing** (lines 277, 317) — subqueries as strings:

```typescript
// line 277
`"${sourceTable}"."${pk}" IN (SELECT "${targetTable}"."${foreignKey}" FROM "${targetTable}"${whereClause ? " " + whereClause : ""})`
// line 317
`"${sourceTable}"."${pk}" NOT IN (SELECT "${targetTable}"."${foreignKey}" FROM "${targetTable}"${whereClause ? " " + whereClause : ""})`;
```

**Optimizer hints** (lines 1745, 2704) — regex-replacing finished SQL:

```typescript
sql = sql.replace(/^SELECT/, `SELECT ${hints}`);
```

**updateAll** (line 2032) — UPDATE as string:

```typescript
let sql = `UPDATE "${table.name}" SET ${setClauses}`;
```

**deleteAll** (line 2064) — DELETE as string:

```typescript
`DELETE FROM "${table.name}"`;
```

**insertAll** (lines 2229–2326) — full INSERT with ON CONFLICT/DUPLICATE KEY:

```typescript
`INSERT INTO "${table.name}" (${colList}) VALUES ${valueRows.join(", ")}`;
// plus MySQL ON DUPLICATE KEY UPDATE variants (lines 2290–2298)
// plus PostgreSQL ON CONFLICT variants (lines 2293–2326)
```

**HABTM eager-load** (line 3548) — join table query as string:

```typescript
`SELECT "${ownerFk}", "${targetFk}" FROM "${joinTable}" WHERE "${ownerFk}" IN (${pkList})`;
```

**Single-record delete** (line 3775):

```typescript
`DELETE FROM "${table.name}" WHERE "${pk}" = ${quoted}`;
```

### base.ts

**incrementCounter / updateCounters** (lines 2008, 2057, 2062):

```typescript
// line 2008
`UPDATE "${table.name}" SET "${attribute}" = COALESCE("${attribute}", 0) + ${by}${touchClause} WHERE ${this._buildPkWhere(id)}`
// line 2057
`UPDATE "${table.name}" SET ${setClause} WHERE ${whereParts.join(" OR ")}`
// line 2062
`UPDATE "${table.name}" SET ${setClause} WHERE "${this.primaryKey}" IN (${idList})`;
```

**create** (lines 2707–2710):

```typescript
// line 2707 (MySQL empty insert)
`INSERT INTO "${table.name}" () VALUES ()`
// line 2708 (PostgreSQL/SQLite empty insert)
`INSERT INTO "${table.name}" DEFAULT VALUES`
// line 2710
`INSERT INTO "${table.name}" (${colList}) VALUES (${valList})`;
```

**destroy / delete** (lines 2846, 2915, 2930):

```typescript
// line 2846 (destroy with pessimistic lock)
`DELETE FROM "${table.name}" WHERE ${ctor._buildPkWhere(pk)}${lockClause}`
// line 2915 (destroySilently)
`DELETE FROM "${table.name}" WHERE ${ctor._buildPkWhere(pk)}`
// line 2930 (static delete)
`DELETE FROM "${table.name}" WHERE ${this._buildPkWhere(id)}`;
```

**reload / lock!** (lines 2942, 2978):

```typescript
// line 2942
`SELECT * FROM "${ctor.tableName}" WHERE ${ctor._buildPkWhere(this.id)}`
// line 2978
`SELECT * FROM "${ctor.tableName}" WHERE ${ctor._buildPkWhere(this.id)} ${lockClause}`;
```

**save (\_performUpdate)** (line 3202):

```typescript
`UPDATE "${table.name}" SET ${setClauses} WHERE ${ctor._buildPkWhere(this.id)}`;
```

### nested-attributes.ts

**Foreign key update** (line 225):

```typescript
`UPDATE "${tableName}" SET "${foreignKey}" = ${created.id} WHERE "${pk}" = ${pkVal}`;
```

### associations/join-dependency.ts

**Through-association join** (line 547):

```typescript
`${throughJoinSql} LEFT OUTER JOIN "${targetTable}" "${targetAlias}" ON ${targetJoinOn}`;
```

### Lower priority: infrastructure files

`internal-metadata.ts`, `schema-migration.ts`, and `migration-runner.ts` also
use raw SQL for CREATE TABLE, SELECT, INSERT, DELETE on internal tables. Lower
priority since they're infrastructure, but Rails uses Arel here too.

---

## 2. Inline Inflection Instead of ActiveSupport

ActiveSupport exports: `pluralize`, `singularize`, `camelize`, `underscore`,
`classify`, `tableize`, `titleize`, `humanize`, `dasherize`, `foreignKey`, etc.

### relation.ts — reimplements functions it already imports

The file imports from activesupport at lines 9–13:

```typescript
import {
  underscore as _toUnderscore,
  camelize as _camelize,
  singularize as _singularize,
  pluralize as _pluralize,
} from "@blazetrails/activesupport";
```

Then defines local copies three separate times with incomplete implementations:

**First set** (lines 3059–3086):

```typescript
const singularize = (w: string) => {
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};
const camelize = (n: string) =>
  n
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
const underscore = (n: string) =>
  n
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
const pluralize = (w: string) => {
  /* basic -y, -s, -es rules */
};
```

**Second set** (lines 3316–3331) — duplicate of the above.

**Third set** (lines 3375–3386) — `pluralizeHot()`, another inline pluralize.

These incomplete implementations will fail on irregular words (e.g. "person" →
"people", "axis" → "axes") that the activesupport versions handle correctly.

### nested-attributes.ts — reimplements from scratch with no import

Lines 129–154 define `singularize`, `camelize`, and `underscore` inline.
No import from activesupport exists in this file at all.

```typescript
// line 129
const singularize = (w: string) => {
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};
// line 135
const camelize = (n: string) =>
  n
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
// line 150
const underscore = (n: string) =>
  n
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
```

### delegated-type.ts

Lines 82–83 — manual `underscore()`:

```typescript
const lowerName = typeName.charAt(0).toLowerCase() + typeName.slice(1);
const snakeName = lowerName.replace(/([A-Z])/g, "_$1").toLowerCase();
```

### enum.ts

Line 92 — manual `camelize()`:

```typescript
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
```

Line 103 — manual capitalize:

```typescript
const capitalizedFullName = fullName.charAt(0).toUpperCase() + fullName.slice(1);
```

### delegate.ts

Lines 25–26 — manual capitalize:

```typescript
? `${options.prefix}${method.charAt(0).toUpperCase() + method.slice(1)}`
: `${assocName}${method.charAt(0).toUpperCase() + method.slice(1)}`
```

### reflection.ts — imports some, inlines others

The file imports `underscore`, `pluralize`, `singularize` from activesupport
(line 2), but still does manual capitalization at lines 33 and 35:

```typescript
this.className = singular.charAt(0).toUpperCase() + singular.slice(1);
this.className = name.charAt(0).toUpperCase() + name.slice(1);
```

Should use `classify()` from activesupport.

---

## 3. ActiveSupport Utilities Not Used

### blank / present checks

**attribute-methods.ts** (lines 38–42) — inline blank check:

```typescript
export function attributePresent(this: AttributeRecord, name: string): boolean {
  const value = this.readAttribute(name);
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}
```

Should use `isBlank()` / `isPresent()` from activesupport.

**core.ts** (lines 115–127) — `isPresent` / `isBlank` that check persistence
rather than value blankness. These are semantically different from
activesupport's `isBlank` (they check `isPersisted()`), so this may be
intentional — but it's worth noting the naming collision.

### Other available but unused ActiveSupport features

These are exported by activesupport and used by Rails' ActiveRecord but not
yet wired up in our implementation:

- **`HashWithIndifferentAccess`** — Rails uses this for attribute hashes
- **`Notifications`** — Rails instruments queries via `ActiveSupport::Notifications`
  (our `query-logs.ts` and instrumentation could use this)
- **`Duration` / `TimeZone` / `TimeWithZone`** — timezone-aware attribute handling
- **`MessageEncryptor` / `MessageVerifier`** — our `encryption/` directory has
  its own crypto; Rails delegates to ActiveSupport
- **`CurrentAttributes`** — Rails uses this for request-scoped state
- **`MemoryStore` / `FileStore`** — query cache could use ActiveSupport::Cache
- **`Logger` / `BroadcastLogger`** — our logging could use ActiveSupport::Logger

---

## 4. ActiveModel Integration Status

ActiveModel integration is generally solid. Verified status:

- **Validators** — properly extend base classes from activemodel
  (`PresenceValidator`, `AbsenceValidator`, `LengthValidator`,
  `NumericalityValidator`, `EachValidator`)
- **Type system** — shared with activemodel (`Type`, `ValueType`,
  `StringType`, `IntegerType`, `BooleanType`, etc.)
- **Callbacks** — delegates to activemodel. `Base` extends `Model` from
  activemodel (base.ts line 154), which provides the callback chain.
  `callbacks.ts` registers AR-specific callbacks (beforeSave, afterSave, etc.)
  on that inherited chain.
- **Dirty tracking** — delegates to activemodel. `attribute-methods/dirty.ts`
  adds persistence-aware methods (`savedChangeToAttribute`,
  `attributeBeforeLastSave`) that read from activemodel's `previousChanges`
  and `changes` properties.
- **Errors** — `errors.ts` defines AR-specific error classes (`RecordNotFound`,
  `RecordInvalid`, `StatementInvalid`, etc.). This is correct — Rails does the
  same. AR error classes are distinct from `ActiveModel::Errors` (which tracks
  validation error messages on a record).

---

## Priority Order

1. **relation.ts inline inflection** — Already imports the functions but doesn't
   use them. Pure waste + correctness risk from incomplete implementations.
2. **base.ts raw SQL** — Core CRUD operations (create, update, delete, reload)
   should use Arel InsertManager, UpdateManager, DeleteManager, SelectManager.
3. **relation.ts raw SQL** — updateAll, deleteAll, insertAll, whereAssociated,
   whereMissing, optimizer hints — query building is Arel's entire purpose.
4. **nested-attributes.ts** — Both raw SQL and inline inflection need fixing.
5. **delegated-type.ts / enum.ts / delegate.ts / reflection.ts** — Inline
   string manipulation instead of activesupport.
6. **ActiveSupport utilities** (blank/present, notifications, encryption) —
   Alignment with how Rails wires its internals.
