# Null Override Elimination Plan

Goal: replace all 6,415 null overrides in `test-naming-map.ts` with real implemented features
and matching TS tests, achieving genuine 100% Rails test coverage.

Each step below is a self-contained unit of work — implement the feature, write the tests,
wire up the naming map. Steps within a phase can be done in parallel.

---

## Current state

| Package       | Ruby tests | Matched (real) | Null overrides |
| ------------- | ---------- | -------------- | -------------- |
| arel          | 592        | 592            | 0              |
| activemodel   | 771        | 771            | 0              |
| activerecord  | 5,428      | 5,428          | ~2,400 (null)  |
| activesupport | 2,826      | 2,826          | ~4,000 (null)  |

The 100% figure is inflated by 6,415 null overrides. True coverage is ~33%.

---

## Phase 1 — ActiveRecord associations (core gaps)

Estimated: ~1,150 null overrides eliminated.

### 1.1 — HasMany deep coverage (290 tests)

**File**: `packages/activerecord/src/has-many-extended.test.ts`
**Ruby source**: `activerecord/test/cases/associations/has_many_associations_test.rb`

Key missing behaviors:

- `dependent: :delete_all`, `dependent: :nullify`, `dependent: :restrict_with_error/exception`
- `autosave:` option — saves child records when parent saves
- `inverse_of:` — bidirectional association awareness
- `counter_cache:` — auto-increment/decrement counter column
- `through:` edge cases — uniq, scope, order on through
- `primary_key:` / `foreign_key:` overrides
- Collection `concat`, `replace`, `clear`, `delete_all`, `destroy_all`
- `unscoped` on associations
- Scoping: `where`, `order`, `limit` on association proxy
- `reload` on association proxy
- `any?`, `empty?`, `count`, `size` on proxy
- `build` (vs `create`) — does not persist
- Finding with conditions via proxy
- Select/pluck on association

### 1.2 — BelongsTo deep coverage (139 tests)

**File**: `packages/activerecord/src/belongs-to-extended.test.ts`
**Ruby source**: `activerecord/test/cases/associations/belongs_to_associations_test.rb`

Key missing behaviors:

- `counter_cache:` — auto-update parent counter
- `touch:` — touch parent on child update/destroy
- `optional:` — skip presence validation
- `autosave:` — save parent when child saves
- `inverse_of:` — bidirectional
- `polymorphic:` — full polymorphic belongs_to
- `primary_key:` / `foreign_key:` overrides
- Assignment: `record.owner = nil` clears FK
- Build: `record.build_owner(attrs)`
- Create: `record.create_owner(attrs)`
- Reload: `record.reload_owner`

### 1.3 — HasOne deep coverage (89 tests)

**File**: `packages/activerecord/src/has-one-extended.test.ts`
**Ruby source**: `activerecord/test/cases/associations/has_one_associations_test.rb`

Key missing behaviors:

- `dependent:` all variants
- `autosave:`
- `inverse_of:`
- `through:` (has_one through)
- `required:`
- Build / create: `record.build_profile`, `record.create_profile`
- Nullify previous when reassigning

### 1.4 — HABTM deep coverage (89 tests)

**File**: `packages/activerecord/src/habtm-extended.test.ts`
**Ruby source**: `activerecord/test/cases/associations/has_and_belongs_to_many_associations_test.rb`

Key missing behaviors:

- Join table insert/delete
- `uniq` / `distinct` on join results
- Conditions on through
- `delete` vs `destroy` semantics
- Callbacks: `before_add`, `after_add`, `before_remove`, `after_remove`
- `collection_singular_ids` getter/setter
- `any?`, `empty?`, `count`
- Order, limit on association

### 1.5 — AssociationsJoinModel (102 tests)

**File**: `packages/activerecord/src/join-model.test.ts`
**Ruby source**: `activerecord/test/cases/associations/join_model_test.rb`

Key missing behaviors:

- Join model with extra attributes
- Scoped through associations
- Polymorphic through
- Named scopes on join model
- Destroy join record

### 1.6 — HasManyThrough deep coverage (154 tests)

**File**: `packages/activerecord/src/has-many-through-extended.test.ts`
**Ruby source**: `activerecord/test/cases/associations/has_many_through_associations_test.rb`

Key missing behaviors:

- Source association options
- Scoped through
- `delete` / `destroy` removes join records
- `uniq` / `distinct`
- `counter_cache` on through
- Nested through (through a through)

### 1.7 — HasOneThroughAssociations (46 tests)

**File**: add to `has-one-extended.test.ts`
**Ruby source**: `activerecord/test/cases/associations/has_one_through_associations_test.rb`

### 1.8 — NestedThroughAssociations (63 tests)

**File**: `packages/activerecord/src/nested-through.test.ts`
**Ruby source**: `activerecord/test/cases/associations/nested_through_associations_test.rb`

Key missing behaviors:

- 3-level through chains
- Scoped at each level
- Mixed through/direct at different levels

### 1.9 — EagerLoading deep coverage (176 tests)

**File**: `packages/activerecord/src/eager-extended.test.ts`
**Ruby source**: `activerecord/test/cases/associations/eager_test.rb`

Key missing behaviors:

- Polymorphic preload
- Nested eager (2-3 levels)
- Eager with where conditions referencing association
- Eager + order on association
- Cascaded eager (separate file)

### 1.10 — InverseAssociations (26+ tests)

**File**: `packages/activerecord/src/inverse-associations.test.ts`
**Ruby source**: `activerecord/test/cases/associations/inverse_associations_test.rb`

Key missing behaviors:

- `inverse_of:` auto-detection
- Bidirectional assignment
- `inverse_of: false` to disable

---

## Phase 2 — ActiveRecord core gaps

Estimated: ~700 null overrides eliminated.

### 2.1 — Single Table Inheritance / STI (59 tests)

**Files**: `packages/activerecord/src/sti.ts`, `packages/activerecord/src/sti.test.ts`
**Ruby source**: `activerecord/test/cases/inheritance_test.rb`

Implementation:

- `type` column written with class name on create
- Queries on subclass automatically scope by type
- `find` instantiates correct subclass
- `descendants`, `subclasses` class methods
- `becomes` to switch STI type
- Validation that type column exists
- Scoping: `Person.where(...)` vs `Student.where(...)` vs `Teacher.where(...)`

### 2.2 — Migrations (53 tests)

**Files**: `packages/activerecord/src/migration.ts`, `packages/activerecord/src/migration.test.ts`
**Ruby source**: `activerecord/test/cases/migration_test.rb`

Implementation:

- DSL: `createTable`, `dropTable`, `addColumn`, `removeColumn`, `renameColumn`
- `addIndex`, `removeIndex`
- `changeColumn` (type, default, null)
- `reversible` / `revert`
- Schema tracking (version table)
- Up/down/change interface

### 2.3 — Serialized attributes (47 tests)

**Files**: update `packages/activerecord/src/serialize.ts`, add `serialize-extended.test.ts`
**Ruby source**: `activerecord/test/cases/serialized_attribute_test.rb`

Key missing behaviors:

- Custom coder (object with `load`/`dump`)
- `Array` type coercion
- `Hash` type coercion
- Dirty tracking of serialized column
- Default value for serialized attribute

### 2.4 — Store accessor dirty tracking (45 tests)

**File**: `packages/activerecord/src/store-extended.test.ts`
**Ruby source**: `activerecord/test/cases/store_test.rb`

Key missing behaviors:

- `store_accessor` marks attribute as changed
- `changed?` on accessor
- `_was` / `_before_last_save` for store keys
- Prefixed / suffixed accessors
- Nullifying store

### 2.5 — FinderTest deep coverage (71 tests)

**File**: `packages/activerecord/src/finder-extended.test.ts`
**Ruby source**: `activerecord/test/cases/finder_test.rb`

Key missing behaviors:

- `find_by!` raises on miss
- `find_or_initialize_by`
- Dynamic finders (find_by_name, etc. via method_missing — in TS via proxy or explicit)
- `find` with multiple IDs
- `find` with lock
- `exists?` variants
- `take`, `take!`

### 2.6 — CalculationsTest deep coverage (73 tests)

**File**: `packages/activerecord/src/calculations-extended.test.ts`
**Ruby source**: `activerecord/test/cases/calculations_test.rb`

Key missing behaviors:

- `minimum`, `maximum` with conditions
- `sum` with expression
- `average` with conditions
- Grouped calculations with joins
- `count` with distinct
- `pluck` with multiple columns
- `pick`

### 2.7 — RelationTest deep coverage (47 tests)

**File**: `packages/activerecord/src/relation-extended.test.ts`
**Ruby source**: `activerecord/test/cases/relations_test.rb`

Key missing behaviors:

- `merge` of two relations
- `none` — returns empty relation
- `unscoped`
- `extending` with module
- `readonly`
- `references`

### 2.8 — WhereTest / WhereChainTest deep coverage (52+52 tests)

**File**: `packages/activerecord/src/where-extended.test.ts`
**Ruby source**: `activerecord/test/cases/where_chain_test.rb`

Key missing behaviors:

- `where.not` complex cases
- `where.missing` — LEFT JOIN IS NULL
- `where.associated` — LEFT JOIN IS NOT NULL
- Range conditions
- Array conditions with nil
- SQL injection safety

### 2.9 — BasicsTest deep coverage (70 tests)

**File**: `packages/activerecord/src/basics-extended.test.ts`
**Ruby source**: `activerecord/test/cases/base_test.rb`

Key missing behaviors:

- `becomes` (STI)
- `clone` vs `dup`
- `inspect`
- Abstract classes
- Table name conventions
- Column defaults
- `attribute_names`

### 2.10 — AttributeMethodsTest deep coverage (59 tests)

**File**: `packages/activerecord/src/attribute-methods-extended.test.ts`
**Ruby source**: `activerecord/test/cases/attribute_methods_test.rb`

Key missing behaviors:

- `_before_type_cast`
- `_came_from_user?`
- Dangerous attribute names
- Alias attributes
- `attribute_was` etc.

### 2.11 — Optimistic locking (30 tests)

**File**: `packages/activerecord/src/optimistic-locking-extended.test.ts`
**Ruby source**: `activerecord/test/cases/locking_test.rb`

Key missing behaviors:

- `lock_version` increments on update
- `StaleObjectError` on concurrent update
- Custom lock column
- Nil lock handling
- Lock without default

### 2.12 — Pessimistic locking

**File**: `packages/activerecord/src/pessimistic-locking.test.ts`
**Ruby source**: `activerecord/test/cases/locking_test.rb`

Implementation:

- `lock!` — issues `SELECT ... FOR UPDATE`
- `with_lock` block
- MemoryAdapter: simulate lock with throw on concurrent access

### 2.13 — Composite primary keys

**File**: `packages/activerecord/src/composite-pk.test.ts`
**Ruby source**: `activerecord/test/cases/composite_primary_key_test.rb`

Implementation:

- `self.primary_key = [:shop_id, :id]`
- Queries use compound where clause
- `find([shop_id, id])`
- Associations with composite FK

### 2.14 — Timestamps (36 tests)

**File**: `packages/activerecord/src/timestamps-extended.test.ts`
**Ruby source**: `activerecord/test/cases/timestamp_test.rb`

Key missing behaviors:

- `touch` updates `updated_at`
- `touch(:field)` touches specific column
- `no_touching` block
- Cascade touch through associations
- Created_at not updated on update

### 2.15 — ReflectionTest (58 tests)

**File**: `packages/activerecord/src/reflection-extended.test.ts`
**Ruby source**: `activerecord/test/cases/reflection_test.rb`

Key missing behaviors:

- Reflect on all associations by type
- `through_reflection`
- `source_reflection`
- `options` hash inspection
- Macro detection

### 2.16 — PrimaryKeysTest (31 tests)

**File**: `packages/activerecord/src/primary-keys-extended.test.ts`
**Ruby source**: `activerecord/test/cases/primary_keys_test.rb`

### 2.17 — TransactionCallbacksTest (33 tests)

**File**: `packages/activerecord/src/transaction-callbacks-extended.test.ts`
**Ruby source**: `activerecord/test/cases/transaction_callbacks_test.rb`

Key missing behaviors:

- `after_commit` fires after real commit
- `after_rollback` fires after rollback
- Nested transactions with savepoints
- `after_create_commit`, `after_update_commit`, `after_destroy_commit`

### 2.18 — CounterCacheTest deep coverage (37 tests)

**File**: extend existing counter cache tests
**Ruby source**: `activerecord/test/cases/counter_cache_test.rb`

### 2.19 — PreloaderTest (45 tests)

**File**: `packages/activerecord/src/preloader-extended.test.ts`
**Ruby source**: `activerecord/test/cases/preloader_test.rb`

### 2.20 — InsertAllTest remaining (50 tests)

**File**: extend existing InsertAllTest in coverage-boost

---

## Phase 3 — ActiveRecord advanced features

Estimated: ~400 null overrides eliminated.

### 3.1 — Autosave associations (~200 tests across 12 test classes)

**Files**: `packages/activerecord/src/autosave.ts`, `packages/activerecord/src/autosave.test.ts`
**Ruby source**: `activerecord/test/cases/autosave_association_test.rb`

Implementation:

- `autosave: true` on has_many — saves all unsaved children when parent saves
- `autosave: true` on belongs_to — saves parent when child saves
- Validation propagation — errors on children surface on parent
- Destroy marked children on parent save
- Mark children for destruction with `mark_for_destruction`

### 3.2 — Strict loading deep coverage (29 tests)

**File**: extend existing StrictLoadingTest

### 3.3 — Delegated type

**File**: `packages/activerecord/src/delegated-type.test.ts`
**Ruby source**: `activerecord/test/cases/delegated_type_test.rb`

### 3.4 — SignedId (24 tests)

**File**: extend existing signed ID tests
**Ruby source**: `activerecord/test/cases/signed_id_test.rb`

### 3.5 — UpdateAll deep coverage (23 tests)

### 3.6 — SelectTest deep coverage (23 tests)

### 3.7 — OrTest deep coverage (24 tests)

### 3.8 — InnerJoinAssociationTest (30 tests)

### 3.9 — NestedRelationScopingTest

### 3.10 — NullRelationTest deep coverage

### 3.11 — ReadOnlyTest

### 3.12 — UniquenessValidationTest deep coverage (38 tests)

---

## Phase 4 — ActiveSupport time and date

Estimated: ~550 null overrides eliminated.

### 4.1 — ActiveSupport::Duration (79 tests)

**Files**: `packages/activesupport/src/duration.ts`, `packages/activesupport/src/duration.test.ts`
**Ruby source**: `activesupport/test/core_ext/numeric_ext_test.rb`, `duration_test.rb`

Implementation:

```typescript
class Duration {
  constructor(parts: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  });
  static seconds(n: number): Duration;
  static minutes(n: number): Duration;
  static hours(n: number): Duration;
  static days(n: number): Duration;
  static weeks(n: number): Duration;
  static months(n: number): Duration;
  static years(n: number): Duration;
  plus(other: Duration): Duration;
  minus(other: Duration): Duration;
  times(n: number): Duration;
  inSeconds(): number;
  inMinutes(): number;
  inHours(): number;
  inDays(): number;
  inWeeks(): number;
  ago(from?: Date): Date;
  since(from?: Date): Date;
  fromNow(): Date;
  until(date?: Date): Date;
  toString(): string; // "1 year and 2 months"
}
```

### 4.2 — TimeWithZone (147 tests)

**Files**: `packages/activesupport/src/time-with-zone.ts`, test file
**Ruby source**: `activesupport/test/time_with_zone_test.rb`

Implementation using `Intl.DateTimeFormat`:

```typescript
class TimeWithZone {
  constructor(utc: Date, zone: ActiveSupport.TimeZone);
  static now(zone: string): TimeWithZone;
  plus(duration: Duration): TimeWithZone;
  minus(duration: Duration): TimeWithZone;
  toLocal(): Date;
  toUtc(): Date;
  inTimeZone(zone: string): TimeWithZone;
  format(fmt: string): string;
  dst(): boolean;
  utcOffset(): number;
  zoneName(): string;
}
```

### 4.3 — TimeZone (108 tests)

**Files**: `packages/activesupport/src/time-zone.ts`, test file
**Ruby source**: `activesupport/test/time_zone_test.rb`

Implementation:

- Zone name mapping (Rails name → IANA)
- `TimeZone.all()`, `TimeZone.find("Eastern Time (US & Canada)")`
- UTC offset
- DST awareness via `Intl`

### 4.4 — TimeExtCalculations (113 tests)

**Files**: `packages/activesupport/src/time-ext.ts`, test file
**Ruby source**: `activesupport/test/core_ext/time_ext_test.rb`

Implementation (functions operating on Date):

- `beginningOfDay`, `endOfDay`
- `beginningOfWeek`, `endOfWeek`
- `beginningOfMonth`, `endOfMonth`
- `beginningOfYear`, `endOfYear`
- `nextWeek`, `prevWeek`
- `nextMonth`, `prevMonth`
- `nextYear`, `prevYear`
- `nextOccurring(:monday)`, `prevOccurring`
- `daysInMonth`
- `advance(days: 1, hours: 2)`
- `ago(duration)`, `since(duration)`, `from_now`, `until`
- `seconds_since_midnight`

### 4.5 — DateExtCalculations (52 tests)

**Files**: `packages/activesupport/src/date-ext.ts`, test file
**Ruby source**: `activesupport/test/core_ext/date_ext_test.rb`

Similar to TimeExtCalculations but for Date-only values.

### 4.6 — DateTimeExtCalculations (68 tests)

**Files**: add to time-ext or separate file
**Ruby source**: `activesupport/test/core_ext/date_time_ext_test.rb`

### 4.7 — TimeWithZoneMethodsForTimeAndDateTime (23 tests)

### 4.8 — TimeTravelTest (27 tests)

**File**: `packages/activesupport/src/time-travel.test.ts`

Implementation:

- `travelTo(date, fn)` — freezes `Date.now()` during fn
- `travelBack()` — restores
- Integrates with any code using `new Date()`

---

## Phase 5 — ActiveSupport utilities

Estimated: ~600 null overrides eliminated.

### 5.1 — HashWithIndifferentAccess deep coverage (93 tests)

**File**: extend `packages/activesupport/src/collections.test.ts`
**Ruby source**: `activesupport/test/hash_with_indifferent_access_test.rb`

Key missing behaviors:

- `merge`, `merge!`, `update`
- `select`, `reject`
- `transform_values`, `transform_keys`
- `slice`, `except`
- `to_hash` (convert back to plain object)
- `nested_under_indifferent_access`
- Iteration: `each_key`, `each_value`, `each_pair`
- `assoc`, `rassoc`
- `dig`
- `any?`, `all?`, `none?`, `count`
- `flat_map`, `filter_map`
- Comparison and equality

### 5.2 — HashExtTest (44 tests)

**File**: extend `packages/activesupport/src/collections.test.ts`
**Ruby source**: `activesupport/test/core_ext/hash_ext_test.rb`

Key missing behaviors:

- `to_param` / `to_query`
- `with_indifferent_access`
- `assert_valid_keys`
- `except!` (in-place)
- `compact_blank`
- `deep_merge!` (in-place)

### 5.3 — HashToXml (44 tests)

**Files**: `packages/activesupport/src/hash-to-xml.ts`, test file
**Ruby source**: `activesupport/test/core_ext/hash_ext_test.rb` (to_xml section)

Implementation:

- `toXml(hash, options)` — serialize hash to XML string
- `fromXml(xml)` — parse XML to hash
- Type casting for integers, booleans, dates

### 5.4 — StringInflections deep coverage (63 tests)

**File**: extend `packages/activesupport/src/activesupport.test.ts`
**Ruby source**: `activesupport/test/core_ext/string_inflections_test.rb`

Key missing inflections (many probably already work, need verification):

- `foreign_key` → `person_id`
- `tableize` → `people`
- `classify` → `Person`
- `constantize` — look up class by name
- `safe_constantize`
- `humanize` with keep_id_suffix option
- `upcase_first`, `downcase_first`
- All existing inflections with edge cases (acronyms, etc.)

### 5.5 — InflectorTest deep coverage (48 tests)

**File**: extend inflector tests
**Ruby source**: `activesupport/test/inflector_test.rb`

### 5.6 — OrderedHashTest (42 tests)

**File**: `packages/activesupport/src/ordered-hash.test.ts`

Implementation: `OrderedHash` that preserves insertion order (JS Map-based).

### 5.7 — OrderedOptionsTest (28 tests)

**File**: `packages/activesupport/src/ordered-options.test.ts`

Implementation: Hash-like object that raises on missing keys (used for config).

### 5.8 — EnumerableTests (29 tests)

**File**: extend `packages/activesupport/src/collections.test.ts`
**Ruby source**: `activesupport/test/core_ext/enumerable_test.rb`

Key missing behaviors:

- `sum` with block
- `index_by`
- `index_with`
- `many?`
- `exclude?`
- `including`
- `compact_blank`
- `filter_map`
- `tally`
- `flat_map`
- `without`

### 5.9 — ModuleTest (53 tests)

**File**: `packages/activesupport/src/module-ext.test.ts`
**Ruby source**: `activesupport/test/core_ext/module_test.rb`

Key missing behaviors:

- `delegate` macro
- `mattr_accessor` / `cattr_accessor`
- `module_parent`, `module_parents`
- `anonymous?`
- `reachable?`
- `attr_internal`

### 5.10 — RangeTest (47 tests)

**File**: `packages/activesupport/src/range.test.ts`
**Ruby source**: `activesupport/test/core_ext/range_test.rb`

Implementation:

- `Range` class (or extend existing) with `overlaps?`, `include?`
- `each_value` iteration
- `cover?` semantics
- Endless / beginless ranges

### 5.11 — SafeBufferTest (41 tests) / OutputSafetyTest (40 tests)

**Files**: `packages/activesupport/src/safe-buffer.ts`, test file
**Ruby source**: `activesupport/test/safe_buffer_test.rb`

Implementation:

- `SafeBuffer` string that tracks HTML-safety
- `html_safe` marker
- `concat` preserves safety
- Escaping on insertion of unsafe strings

### 5.12 — ObjectTryTest (23 tests)

**File**: extend activesupport tests
**Ruby source**: `activesupport/test/core_ext/object/try_test.rb`

Implementation:

- `tryCall(obj, method, ...args)` — calls method if exists, else nil
- `tryCallBang` — raises if object is nil

### 5.13 — WithTest (22 tests)

**File**: extend activesupport tests
**Ruby source**: `activesupport/test/core_ext/object/with_test.rb`

### 5.14 — NumericExtFormatting (various tests)

**File**: `packages/activesupport/src/number-helper.ts`, test file
**Ruby source**: `activesupport/test/number_helper_test.rb`

Implementation:

- `numberToHuman(n)` — "1.23 Thousand"
- `numberToHumanSize(bytes)` — "1.23 MB"
- `numberToCurrency(n, { unit, precision })` — "$1,234.56"
- `numberToPercentage(n)` — "75.00%"
- `numberToDelimited(n)` — "1,234,567"
- `numberToRounded(n, precision)` — "1.234"
- `numberToPhone(n)` — "555-123-4567"

### 5.15 — BlankTest, PathnameBlankTest, etc.

Small utilities already partially covered — add missing edge cases.

---

## Phase 6 — ActiveSupport infrastructure

Estimated: ~700 null overrides eliminated.

### 6.1 — Deprecation (93 tests)

**Files**: `packages/activesupport/src/deprecation.ts`, test file
**Ruby source**: `activesupport/test/deprecation_test.rb`

Implementation:

```typescript
class Deprecation {
  constructor(horizon?: string, gem?: string);
  warn(message: string, callstack?: string[]): void;
  silence(fn: () => void): void;
  behavior: "raise" | "warn" | "log" | "silence";
  static deprecateMethod(target: object, method: string, message: string): void;
}
const Deprecation = new ActiveSupport.Deprecation();
```

### 6.2 — ActiveSupport::Logger (31 tests)

**Files**: `packages/activesupport/src/logger.ts`, test file
**Ruby source**: `activesupport/test/logger_test.rb`

Implementation:

```typescript
class Logger {
  constructor(output?: WritableStream | null);
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  fatal(msg: string): void;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  silence(level?: LogLevel, fn?: () => void): void;
  readonly formatter: (severity: string, msg: string) => string;
}
```

### 6.3 — BroadcastLogger (37 tests)

**Files**: `packages/activesupport/src/broadcast-logger.ts`, test file
**Ruby source**: `activesupport/test/broadcast_logger_test.rb`

Implementation:

- Wraps multiple loggers
- Delegates all log calls to all loggers
- Level is the minimum of all loggers

### 6.4 — TaggedLogging

**Files**: extend logger
**Ruby source**: `activesupport/test/tagged_logging_test.rb`

Implementation:

- `logger.taggedWith("tag1", "tag2", fn)` — prepends tags to log output

### 6.5 — Cache stores (~200 tests across MemoryStore, FileStore, NullStore)

**Files**: `packages/activesupport/src/cache/`, test files
**Ruby source**: `activesupport/test/cache/stores/`

Implementation:

```typescript
interface CacheStore {
  read(key: string): unknown
  write(key: string, value: unknown, options?: { expires_in?: number }): void
  delete(key: string): void
  exist?(key: string): boolean
  fetch(key: string, fn: () => unknown): unknown
  clear(): void
  readMulti(...keys: string[]): Record<string, unknown>
  writeMulti(hash: Record<string, unknown>): void
  increment(key: string, n?: number): number
  decrement(key: string, n?: number): number
}

class MemoryStore implements CacheStore { ... }
class NullStore implements CacheStore { ... }
class FileStore implements CacheStore { ... }  // uses node:fs
```

### 6.6 — Notifications / Instrumentation (50 tests)

**Files**: `packages/activesupport/src/notifications.ts`, test file
**Ruby source**: `activesupport/test/notifications_test.rb`

Implementation:

```typescript
const Notifications = {
  subscribe(pattern: string | RegExp, fn: EventHandler): Subscriber,
  unsubscribe(subscriber: Subscriber): void,
  instrument(name: string, payload?: object, fn?: () => unknown): unknown,
  publish(name: string, payload: object): void,
}
```

### 6.7 — ErrorReporter (32 tests)

**Files**: `packages/activesupport/src/error-reporter.ts`, test file
**Ruby source**: `activesupport/test/error_reporter_test.rb`

### 6.8 — ExecutionContext / IsolatedExecutionState (various)

### 6.9 — CurrentAttributes (various)

**Files**: `packages/activesupport/src/current-attributes.ts`, test file

Implementation:

```typescript
class CurrentAttributes {
  static attribute(...names: string[]): void;
  static reset(): void;
  // thread-local (in JS: AsyncLocalStorage or simple global reset per request)
}
```

### 6.10 — BacktraceCleaner (30 tests)

**Files**: `packages/activesupport/src/backtrace-cleaner.ts`, test file
**Ruby source**: `activesupport/test/backtrace_cleaner_test.rb`

Implementation:

- Add filters (string prefix to remove)
- Add silencers (regex to suppress)
- `clean(backtrace)` applies all

---

## Phase 7 — ActiveSupport security

Estimated: ~200 null overrides eliminated.

### 7.1 — MessageEncryptor (various)

**Files**: `packages/activesupport/src/message-encryptor.ts`, test file
**Ruby source**: `activesupport/test/message_encryptor_test.rb`

Implementation using Web Crypto API:

```typescript
class MessageEncryptor {
  constructor(key: string | Buffer, options?: { cipher?: string; digest?: string });
  encryptAndSign(value: unknown): string;
  decryptAndVerify(encoded: string): unknown;
}
```

### 7.2 — MessageVerifier (various)

**Files**: `packages/activesupport/src/message-verifier.ts`, test file
**Ruby source**: `activesupport/test/message_verifier_test.rb`

Implementation using HMAC-SHA256:

```typescript
class MessageVerifier {
  constructor(secret: string, options?: { digest?: string; serializer?: object });
  generate(value: unknown, options?: { expires_in?: number }): string;
  verify(token: string): unknown; // raises on invalid
  verified(token: string): unknown | null; // returns null on invalid
  validMessage(token: string): boolean;
}
```

### 7.3 — KeyGenerator / CachingKeyGenerator

### 7.4 — SecureCompare

---

## Phase 8 — Remaining miscellaneous

Estimated: ~800 null overrides eliminated.

### 8.1 — Assertions / MethodCallAssertions (49+24 tests)

**File**: `packages/activesupport/src/assertions.test.ts`
Tests for: `assert_difference`, `assert_no_difference`, `assert_changes`, etc.

### 8.2 — JSON serialization deep coverage (TestJSONEncoding: 46, JsonSerializationTest: 13)

**File**: extend existing JSON tests

Key missing:

- `as_json` options (only, except, include, methods)
- Custom `as_json` overrides
- Circular reference handling

### 8.3 — SanitizeTest (various)

**Files**: `packages/activesupport/src/sanitizer.ts`, test file

### 8.4 — Multibyte (49 tests)

**Files**: `packages/activesupport/src/multibyte.ts`, test file
**Ruby source**: `activesupport/test/multibyte_chars_test.rb`

Note: JS handles UTF-8 natively. Many of these may trivially pass by delegating to
`String.prototype` methods. Tests around grapheme clusters may need special handling.

### 8.5 — AtomicWriteTest, FileFixturesTest

### 8.6 — InflectorTest edge cases (acronyms, custom rules)

### 8.7 — Remaining small classes (< 10 tests each)

---

## Execution order

```
Week 1:  Phase 1 (associations) — highest test count, most impactful
Week 2:  Phase 2 (AR core gaps) — STI, migrations, finders, calculations
Week 3:  Phase 3 (AR advanced) — autosave, delegated type, remaining AR
Week 4:  Phase 4 (time/date) — Duration, TimeWithZone, date math
Week 5:  Phase 5 (AS utilities) — hash, string, enumerable, module
Week 6:  Phase 6 (AS infrastructure) — logger, cache, notifications
Week 7:  Phase 7+8 (security + misc) — crypto, sanitize, remaining
```

---

## Per-step template

Each step follows this pattern:

1. **Read** the Rails source test file to understand what's covered
2. **Implement** the feature in `packages/*/src/<feature>.ts`
3. **Write tests** in `packages/*/src/<feature>.test.ts` matching Ruby test names
4. **Register** the test file in `scripts/test-compare/extract-ts-tests.ts`
5. **Map** the Ruby test names → TS test names in `scripts/test-compare/test-naming-map.ts`
6. **Run** `npm run test:compare` to verify coverage increases
7. **Run** `npx vitest run` to verify tests pass

---

## Files that will need updates across all steps

- `scripts/test-compare/extract-ts-tests.ts` — register new test files
- `scripts/test-compare/test-naming-map.ts` — add mappings per step
- `packages/*/src/index.ts` — export new implementations
- `packages/*/package.json` — no changes expected
