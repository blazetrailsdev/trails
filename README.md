# rails-ts

TypeScript packages that mirror the Ruby on Rails API.

The goal of this project is to be **100% API compatible with Rails**, matching behavior **test for test** against the Rails source. If you can read the [Rails API docs](https://api.rubyonrails.org/), you already know how to use this — class names, method signatures, and behavior are designed to match Rails as closely as TypeScript allows, while adding the type safety that Ruby can't.

## Packages

| Package                      | Rails Equivalent                                                              | Convention Compare | Description                                                |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `@rails-ts/arel`             | [Arel](https://api.rubyonrails.org/classes/Arel.html)                         | **99.4%**          | SQL AST builder and query generation                       |
| `@rails-ts/activemodel`      | [ActiveModel](https://api.rubyonrails.org/classes/ActiveModel.html)           | **100%**           | Attributes, validations, callbacks, dirty tracking, i18n   |
| `@rails-ts/rack`             | [Rack](https://rack.github.io/)                                               | **99%**            | Modular web server interface, request/response, middleware |
| `@rails-ts/activerecord`     | [ActiveRecord](https://api.rubyonrails.org/classes/ActiveRecord.html)         | **75.7%**          | ORM — persistence, querying, associations, migrations      |
| `@rails-ts/activesupport`    | [ActiveSupport](https://api.rubyonrails.org/classes/ActiveSupport.html)       | **94.6%**          | Core utilities, inflection, caching, notifications         |
| `@rails-ts/actiondispatch`   | [ActionDispatch](https://api.rubyonrails.org/classes/ActionDispatch.html)     | **25.1%**          | Routing, middleware stack, cookies, sessions, security     |
| `@rails-ts/actioncontroller` | [ActionController](https://api.rubyonrails.org/classes/ActionController.html) | **0.4%**           | Controller layer, rendering, filters, parameters           |

**69.3%** complete — 11,900 tests matched against 17,172 Rails tests.

Progress is measured by `npm run convention:compare`, which matches our test files and test names against the actual Rails test suite. CI runs this on every push.

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
// TypeScript / rails-ts
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

| Ruby / Rails     | TypeScript / `rails-ts`         | Example                                   |
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
npm install

# Run tests (uses in-memory SQLite adapter by default)
npx vitest run

# Build all packages
npm run build
```

### Measuring Progress Against Rails

```bash
# Compare test coverage against the Rails test suite
# Matches our test file names and it()/it.skip() descriptions against Ruby test names
npm run convention:compare

# Compare public API surface against Rails
npm run api:compare

# Generate stub tests for any unmatched Rails tests
npm run test:stubs
```

CI runs `convention:compare` on every push to ensure we don't regress.

### Database Adapters

Tests run against all three database backends in CI:

| Backend             | How to run locally                          | Env variable     |
| ------------------- | ------------------------------------------- | ---------------- |
| In-memory (default) | `npx vitest run`                            | (none)           |
| PostgreSQL          | `PG_TEST_URL=postgres://... npx vitest run` | `PG_TEST_URL`    |
| MySQL/MariaDB       | `MYSQL_TEST_URL=mysql://... npx vitest run` | `MYSQL_TEST_URL` |

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
