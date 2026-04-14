# trails

TypeScript packages that mirror the Ruby on Rails API.

The goal is to be **100% API compatible with Rails**, matching behavior **test for test** against the Rails source. The current focus is getting ActiveRecord to full parity — it's the heart of Rails and the package with the most ground to cover. If you can read the [Rails API docs](https://api.rubyonrails.org/), you already know how to use this — class names, method signatures, and behavior are designed to match Rails as closely as TypeScript allows, while adding the type safety that Ruby can't.

## Packages

**Active focus** — these packages are where development effort is concentrated:

| Package                      | Rails Equivalent                                                        | API       | Tests     | Description                                                |
| ---------------------------- | ----------------------------------------------------------------------- | --------- | --------- | ---------------------------------------------------------- |
| `@blazetrails/activerecord`  | [ActiveRecord](https://api.rubyonrails.org/classes/ActiveRecord.html)   | **61.5%** | **62%**   | ORM — persistence, querying, associations, migrations      |
| `@blazetrails/activesupport` | [ActiveSupport](https://api.rubyonrails.org/classes/ActiveSupport.html) | **23.9%** | **77.9%** | Core utilities, inflection, caching, notifications         |
| `@blazetrails/arel`          | [Arel](https://api.rubyonrails.org/classes/Arel.html)                   | **100%**  | **99.4%** | SQL AST builder and query generation                       |
| `@blazetrails/activemodel`   | [ActiveModel](https://api.rubyonrails.org/classes/ActiveModel.html)     | **100%**  | **100%**  | Attributes, validations, callbacks, dirty tracking, i18n   |
| `@blazetrails/rack`          | [Rack](https://rack.github.io/)                                         | —         | **100%**  | Modular web server interface, request/response, middleware |

**Data Layer Parity** (ActiveRecord + Arel + ActiveModel): **69% API** | **70.4% Tests**

**ActionPack & friends** — started but not the current priority:

| Package                   | Rails Equivalent                                                              | API       | Tests     | Description                                            |
| ------------------------- | ----------------------------------------------------------------------------- | --------- | --------- | ------------------------------------------------------ |
| `@blazetrails/actionpack` | [ActionController](https://api.rubyonrails.org/classes/ActionController.html) | **67.6%** | **28.3%** | Controller layer, rendering, filters, parameters       |
|                           | [ActionDispatch](https://api.rubyonrails.org/classes/ActionDispatch.html)     | **6.1%**  | **37.3%** | Routing, middleware stack, cookies, sessions, security |
| `@blazetrails/actionview` | [ActionView](https://api.rubyonrails.org/classes/ActionView.html)             | **3.7%**  | **5.1%**  | Templates, rendering, view helpers                     |
| `@blazetrails/trailties`  | [Railties](https://api.rubyonrails.org/classes/Rails.html)                    | **0.1%**  | **3.9%**  | CLI, generators, application bootstrap                 |

**Tests** = `test:compare` — matches our test names against the Rails test suite. **API** = `api:compare` — matches individual public methods against Rails source (method-level, not class/module wrappers). Rack doesn't have API comparison yet (it's not a Rails gem).

**40.9%** overall API coverage (3,027 / 7,396 methods) and **50.9%** test coverage (11,145 / 21,890 tests). CI runs both comparisons on every push.

## Quick Example

Rails patterns translate directly:

```ruby
# Ruby / Rails
class Post < ActiveRecord::Base
  attribute :title, :string
  attribute :published, :boolean, default: false
  validates :title, presence: true
  has_many :comments
end

post = Post.create!(title: "Hello World")
post.update!(published: true)
Post.where(published: true).order(:title)
```

```typescript
// TypeScript / trails
class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean", { default: false });
    this.validates("title", { presence: true });
    this.hasMany("comments");
  }
}

const post = await Post.create({ title: "Hello World" });
await post.updateBang({ published: true });
Post.where({ published: true }).order("title");
```

## Ruby to TypeScript Conventions

| Ruby / Rails     | TypeScript / `trails`           | Example                                   |
| ---------------- | ------------------------------- | ----------------------------------------- |
| `valid?`         | `isValid()`                     | Predicates (`?`) become `is*` prefix.     |
| `save!`          | `saveBang()`                    | Bang methods (`!`) become `*Bang` suffix. |
| `initialize`     | `constructor`                   | Standard TypeScript class constructors.   |
| `table[:id]`     | `table.get("id")`               | The `[]` operator is mapped to `get()`.   |
| `model[:id]`     | `model.readAttribute("id")`     | Explicit attribute reading.               |
| `model[:id] = 1` | `model.writeAttribute("id", 1)` | Explicit attribute writing.               |

## Design Principles

- **Rails API fidelity** — Names and call signatures match Rails. When the Rails docs show `User.where(name: "dean").order(:created_at)`, the TypeScript equivalent should feel the same.
- **Idiomatic TypeScript** — Generics, literal types, and discriminated unions are used where they improve the developer experience without breaking Rails parity.
- **Type-safe, string-friendly** — Typed column references are preferred, but the string form is always supported for parity with Rails.
- **Test-driven** — Progress is measured by matching behavior against the actual Rails test suite, not just API shape.

## Development

```bash
# Install dependencies
pnpm install

# Run tests (uses SQLite adapter by default)
pnpm vitest run

# Build all packages
pnpm run build
```

### Measuring Progress Against Rails

```bash
# Compare test coverage against the Rails test suite
# Matches our test file names and it()/it.skip() descriptions against Ruby test names
pnpm run test:compare

# Compare public API surface against Rails
pnpm run api:compare

# Generate stub tests for any unmatched Rails tests
pnpm run test:stubs
```

CI runs `test:compare` and `api:compare` on every push to ensure we don't regress.

### Database Adapters

Tests run against all three database backends in CI:

| Backend          | How to run locally                           | Env variable     |
| ---------------- | -------------------------------------------- | ---------------- |
| SQLite (default) | `pnpm vitest run`                            | (none)           |
| PostgreSQL       | `PG_TEST_URL=postgres://... pnpm vitest run` | `PG_TEST_URL`    |
| MySQL/MariaDB    | `MYSQL_TEST_URL=mysql://... pnpm vitest run` | `MYSQL_TEST_URL` |

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
  actionview/       — Templates, rendering, view helpers
  trailties/        — CLI, generators, application bootstrap
```

## Disclaimer

Trails is not affiliated with, endorsed by, or connected to Ruby on Rails or the Rails Core team. Rails is an inspiration and a guiding light for this project's API design, but Rails and its trademarks belong to their respective owners.

## License

MIT
