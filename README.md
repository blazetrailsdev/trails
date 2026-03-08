# rails-ts

TypeScript packages that mirror the Ruby on Rails API.

The goal of this project is to be **100% API compatible with Rails**, matching behavior **test for test** against the Rails source. If you can read the [Rails API docs](https://api.rubyonrails.org/), you already know how to use this — class names, method signatures, and behavior are designed to match Rails as closely as TypeScript allows, while adding the type safety that Ruby can't.

## Packages

| Package | Rails Equivalent | Status | Description |
|---------|-----------------|--------|-------------|
| `@rails-ts/arel` | [Arel](https://api.rubyonrails.org/classes/Arel.html) | **99.3%** | SQL AST builder and query generation |
| `@rails-ts/activemodel` | [ActiveModel](https://api.rubyonrails.org/classes/ActiveModel.html) | **99%** | Attributes, validations, callbacks, dirty tracking, serialization |
| `@rails-ts/activesupport` | [ActiveSupport](https://api.rubyonrails.org/classes/ActiveSupport.html) | **67.4%** | Core utilities, inflection, caching, notifications, encryption |
| `@rails-ts/activerecord` | [ActiveRecord](https://api.rubyonrails.org/classes/ActiveRecord.html) | **51.4%** | ORM — persistence, querying, associations, migrations |
| `@rails-ts/rack` | [Rack](https://rack.github.io/) | **65.8%** | Modular web server interface, request/response, middleware |
| `@rails-ts/actiondispatch` | [ActionDispatch](https://api.rubyonrails.org/classes/ActionDispatch.html) | **18%** | Routing, middleware stack, cookies, sessions, security |

Overall: **52.1%** — 7,159 tests passing against 13,744 Rails tests.

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

### ActiveRecord — ORM (51.4%)

**Working:**
- Base class with attribute definition, persistence (create/save/update/destroy), finders (find, find_by, where, order, limit, offset, pluck, pick)
- Relation chaining (where, not, or, order, limit, offset, group, having, distinct, select, joins, left_outer_joins, reorder, rewhere, reselect)
- Calculations (count, sum, average, minimum, maximum) with grouped aggregates
- Associations (has_many, belongs_to, has_one, has_and_belongs_to_many, has_many :through, has_one :through) with eager loading, collection proxy, dependent destroy
- Scopes (default_scope, named scopes), Enum, STI (Single Table Inheritance)
- Callbacks (before/after/around for create, update, save, destroy, find, initialize, touch)
- Transactions, optimistic locking (lock_version), counter cache
- Batching (find_each, find_in_batches, in_batches)
- insertAll / upsertAll (bulk operations)
- Serialized attributes (JSON, Array, Hash coders), Store accessors
- Secure tokens, signed IDs, generates_token_for
- Nested attributes, autosave associations
- Migrations and migration runner
- Database adapters: MemoryAdapter (for tests), SQLite, PostgreSQL, MySQL/MariaDB

**In progress:** Eager loading edge cases, inverse associations, join model queries, through association edge cases, nested attributes lifecycle. See [docs/activerecord-100-percent.md](docs/activerecord-100-percent.md) for the full roadmap.

### Rack — Web Server Interface (65.8%)

Request/Response objects, multipart parsing (file uploads), Builder (middleware composition), middleware (ContentType, ContentLength, ETag, ConditionalGet, Deflater, Head, MethodOverride, Runtime, Sendfile, Lock, Static, ShowExceptions, ShowStatus, CommonLogger, Cascade, URLMap), MIME type registry, MockRequest/MockResponse for testing, and HTTP Basic auth. Remaining work is mostly around Rack::Request and Rack::Headers edge cases.

### ActionDispatch — Routing and Middleware (18%)

Route DSL (resources, resource, namespace, scope, member, collection, concerns, constraints, shallow routes), route matching and URL generation, middleware stack, cookies (signed, encrypted, permanent), flash messages, session handling (CookieStore), CSRF protection, content negotiation (respond_to), Content Security Policy, Permissions Policy, SSL enforcement, Host Authorization, HTTP authentication (Basic, Token, Digest), request ID tracking, and redirect helpers. Early stage — routing core works, but controller integration and many middleware edge cases remain.

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

# Run tests
npx vitest run

# Build all packages
npm run build

# Compare test coverage against Rails
npm run test:compare
```

## Project Structure

```
packages/
  arel/           — SQL AST and query building
  activemodel/    — Validations, callbacks, dirty tracking, serialization
  activerecord/   — ORM layer (persistence, querying, associations)
  activesupport/  — Core utilities, inflection, caching, encryption
  rack/           — Web server interface, middleware, request/response
  actiondispatch/ — Routing, cookies, sessions, security middleware
```

## License

MIT
