# rails-ts

TypeScript packages that mirror the Ruby on Rails API.

The goal of this project is to be **100% API compatible with Rails**, matching behavior **test for test** against the Rails source. If you can read the [Rails API docs](https://api.rubyonrails.org/), you already know how to use this — class names, method signatures, and behavior are designed to match Rails as closely as TypeScript allows, while adding the type safety that Ruby can't.

## Packages

| Package | Rails Equivalent | Status | Description |
|---------|-----------------|--------|-------------|
| `@rails-ts/arel` | [Arel](https://api.rubyonrails.org/classes/Arel.html) | **99.3%** | SQL AST builder and query generation |
| `@rails-ts/activemodel` | [ActiveModel](https://api.rubyonrails.org/classes/ActiveModel.html) | **99%** | Attributes, validations, callbacks, dirty tracking, serialization |
| `@rails-ts/activesupport` | [ActiveSupport](https://api.rubyonrails.org/classes/ActiveSupport.html) | **67.4%** | Core utilities, inflection, caching, notifications, encryption |
| `@rails-ts/activerecord` | [ActiveRecord](https://api.rubyonrails.org/classes/ActiveRecord.html) | **62.9%** | ORM — persistence, querying, associations, migrations |
| `@rails-ts/rack` | [Rack](https://rack.github.io/) | **99%** | Modular web server interface, request/response, middleware |
| `@rails-ts/actiondispatch` | [ActionDispatch](https://api.rubyonrails.org/classes/ActionDispatch.html) | **27.9%** | Routing, middleware stack, cookies, sessions, security |
| `@rails-ts/actioncontroller` | [ActionController](https://api.rubyonrails.org/classes/ActionController.html) | **17.9%** | Controller layer, rendering, filters, parameters |

Overall: **50.1%** real — 6,892 tests matched against 13,744 Rails tests.

## Quick Example

Rails patterns translate directly:

```ruby
# Ruby / Rails
users = Arel::Table.new(:users)
query = users.project(users[:name])
              .where(users[:age].gt(21))
              .order(users[:name].asc)
query.to_sql
# => SELECT "users"."name" FROM "users" WHERE "users"."age" > 21 ORDER BY "users"."name" ASC
```

```typescript
// TypeScript / rails-ts
const users = new Arel.Table("users");
const query = users.project(users.get("name"))
                   .where(users.get("age").gt(21))
                   .order(users.get("name").asc());
query.toSql();
// => SELECT "users"."name" FROM "users" WHERE "users"."age" > 21 ORDER BY "users"."name" ASC
```

## What's Implemented

### Arel — SQL AST and Query Building (99.3%)

Full SQL AST with nodes for SELECT, INSERT, UPDATE, DELETE, JOINs, subqueries, CTEs, window functions, set operations (UNION/INTERSECT/EXCEPT), and CASE expressions. Visitor pattern generates SQL strings. Essentially complete.

### ActiveModel — Model Layer (99%)

Attribute definitions with type casting, a full validation framework (presence, length, format, numericality, inclusion, exclusion, custom validators), lifecycle callbacks (before/after/around for validation and save), dirty tracking (changes, previous changes, changed attributes), and serialization.

### ActiveSupport — Core Utilities (67.4%)

String inflection (pluralize, singularize, camelize, underscore, tableize, etc.), Duration arithmetic, HashWithIndifferentAccess, OrderedOptions, CurrentAttributes, concern/mixin pattern, callback system, lazy load hooks, caching (MemoryStore, FileStore, NullStore), notifications/instrumentation, MessageVerifier/MessageEncryptor, parameter filtering, number helpers, deprecation warnings, and safe buffers. Remaining work is mostly TimeZone, date/time extensions, and some Ruby-specific features.

### ActiveRecord — ORM (62.9%)

**Complete (100% test coverage) — 2,614 tests across 44 files:**
- Finders (find, find_by, exists?, take, first/last, sole, positional finders) — 413 tests
- Calculations (count, sum, average, minimum, maximum, grouped aggregates, pluck, pick, ids) — 489 tests
- Persistence (create/save/update/destroy, becomes, increment/decrement/toggle, reload, dup) — 358 tests
- Attribute methods (read/write, dirty tracking, before_type_cast, inspect) — 161 tests
- Belongs-to associations (polymorphic, touch, counter cache, optional/required, autosave) — 153 tests
- Default scoping (default_scope, unscoped, rewhere, reorder, unscope) — 145 tests
- Inheritance / STI (single table inheritance, type column, finder methods) — 106 tests
- Validations (presence, length, format, numericality, inclusion, exclusion, uniqueness, custom) — 161 tests
- Relation core (or, and, annotations, delete_all, mutation, order) — 179 tests
- Migrations (reversible, revert, bulk alter, schema define) — 49 tests
- JSON serialization, custom properties, boolean, dup, errors, explain, and more

**Near-complete (90%+):**
- Relations (98%) — chaining, merge, extending, spawn, readonly, distinct
- Has-many associations (97%) — collection operations, dependent destroy/nullify, polymorphic, scoped
- Named scoping (94%) — scope, extending, merging
- Dirty tracking (94%), timestamps (97%), relation scoping (97%)

**Working:**
- Where clauses (67%) — conditions, ranges, subqueries, whereMissing, whereAssociated
- Associations (has_one, HABTM, has_many :through, has_one :through) with eager loading, inverse_of
- Scopes, Enum, Callbacks, Transactions, optimistic locking, counter cache
- Batching, insertAll/upsertAll, serialized attributes, store accessors
- Nested attributes (88%), autosave, secure tokens, signed IDs, delegated types
- Database adapters: MemoryAdapter (for tests), SQLite, PostgreSQL, MySQL/MariaDB

**In progress:** Where chain (where.not/missing/associated), eager loading through associations, autosave edge cases, HABTM collection operations, strict loading, pessimistic locking. See [docs/activerecord-100-percent.md](docs/activerecord-100-percent.md) for the full breakdown.

### Rack — Web Server Interface (99%)

Request/Response objects, multipart parsing (file uploads), Builder (middleware composition), middleware (ContentType, ContentLength, ETag, ConditionalGet, Deflater, Head, MethodOverride, Runtime, Sendfile, Lock, Static, ShowExceptions, ShowStatus, CommonLogger, Cascade, URLMap), MIME type registry, MockRequest/MockResponse for testing, HTTP Basic auth, Headers, Events, Logger, and RewindableInput. Essentially complete — the only skipped tests are Ruby-specific `.ru` config file parsing features.

### ActionDispatch — Routing and Middleware (27.9%)

Route DSL (resources, resource, namespace, scope, member, collection, concerns, constraints, shallow routes), route matching and URL generation, route helpers (_path/_url), middleware stack, cookies (signed, encrypted, permanent), flash messages, session handling (CookieStore), CSRF protection, content negotiation (respond_to), Content Security Policy, Permissions Policy, SSL enforcement, Host Authorization, HTTP authentication (Basic, Token, Digest), request ID tracking, and redirect helpers. Early stage — routing core works, but controller integration and many middleware edge cases remain.

### ActionController — Controllers (17.9%)

Base controller with rendering (templates, JSON, plain text, status codes), filters (before/after/around), strong parameters, redirect, head, send_file/send_data, and route helper injection. Early stage — basic request/response cycle works.

## Ruby to TypeScript Conventions

| Ruby / Rails | TypeScript / `rails-ts` | Example |
|--------------|-------------------------|---------|
| `valid?` | `isValid()` | Predicates (`?`) become `is*` prefix. |
| `save!` | `saveBang()` | Bang methods (`!`) become `*Bang` suffix. |
| `initialize` | `constructor` | Standard TypeScript class constructors. |
| `table[:id]` | `table.get("id")` | The `[]` operator is mapped to `get()`. |
| `model[:id]` | `model.readAttribute("id")` | Explicit attribute reading. |
| `model[:id] = 1` | `model.writeAttribute("id", 1)` | Explicit attribute writing. |

## Design Principles

- **Rails API fidelity** — Names and call signatures match Rails. When the Rails docs show `User.where(name: "dean").order(:created_at)`, the TypeScript equivalent should feel the same.
- **Idiomatic TypeScript** — Generics, literal types, and discriminated unions are used where they improve the developer experience without breaking Rails parity.
- **Type-safe, string-friendly** — Typed column references are preferred, but the string form is always supported for parity with Rails.
- **Test-driven** — Progress is measured by matching behavior against the actual Rails test suite, not just API shape.

## Development

```bash
# Install dependencies
npm install

# Run tests (uses in-memory SQLite adapter by default)
npx vitest run

# Build all packages
npm run build
```

### Measuring Progress Against Rails

Two compare scripts measure how closely we track the real Rails codebase:

```bash
# Compare public API surface against Rails
# Extracts Ruby method signatures from Rails source and diffs against our TS exports
npm run api:compare

# Compare test coverage against the Rails test suite
# Matches our it()/it.skip() descriptions against Ruby test names
npm run test:compare

# Generate stub tests for any unmatched Rails tests
npm run test:generate-stubs
```

Both scripts fetch the Rails source, extract Ruby definitions, extract our TypeScript equivalents, and produce a comparison report. CI runs both on every push to ensure we don't regress.

### Database Adapters

Tests run against all three database backends in CI:

| Backend | How to run locally | Env variable |
|---------|-------------------|--------------|
| In-memory (default) | `npx vitest run` | (none) |
| PostgreSQL | `PG_TEST_URL=postgres://... npx vitest run` | `PG_TEST_URL` |
| MySQL/MariaDB | `MYSQL_TEST_URL=mysql://... npx vitest run` | `MYSQL_TEST_URL` |

The `SchemaAdapter` wrapper auto-creates tables from model attribute definitions, so tests don't need manual DDL.

## Project Structure

```
packages/
  arel/             — SQL AST and query building
  activemodel/      — Validations, callbacks, dirty tracking, serialization
  activerecord/     — ORM layer (persistence, querying, associations)
  activesupport/    — Core utilities, inflection, caching, encryption
  rack/             — Web server interface, middleware, request/response
  actionpack/       — ActionDispatch (routing, cookies, sessions) and ActionController
```

## License

MIT
