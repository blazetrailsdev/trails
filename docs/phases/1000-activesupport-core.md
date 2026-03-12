# Phase 1000: ActiveSupport — Core Extensions & Inflector

**Goal**: Create the `@rails-ts/activesupport` package with the foundational
utilities that ActiveModel and ActiveRecord depend on. This eliminates
duplicated helper functions currently scattered across packages.

## Package setup

Create `packages/activesupport/` with the same structure as other packages.
Add it as a workspace dependency of `activemodel` and `activerecord`.

## Inflector (highest priority)

Currently duplicated in `base.ts`, `associations.ts`, and `naming.ts`.

### Methods to implement

- `pluralize(word)` — `"user"` → `"users"`
- `singularize(word)` — `"users"` → `"user"`
- `camelize(term)` — `"active_record"` → `"ActiveRecord"`
- `underscore(term)` — `"ActiveRecord"` → `"active_record"`
- `titleize(word)` — `"active_record"` → `"Active Record"`
- `tableize(className)` — `"BlogPost"` → `"blog_posts"`
- `classify(tableName)` — `"blog_posts"` → `"BlogPost"`
- `dasherize(word)` — `"active_record"` → `"active-record"`
- `demodulize(path)` — `"ActiveRecord::Base"` → `"Base"`
- `deconstantize(path)` — `"ActiveRecord::Base"` → `"ActiveRecord"`
- `foreign_key(className)` — `"BlogPost"` → `"blog_post_id"`
- `constantize(string)` — look up class by name (registry-based in TS)
- `humanize(word)` — `"employee_salary"` → `"Employee salary"`
- `parameterize(string)` — `"Blog Post"` → `"blog-post"`
- `ordinal(number)` / `ordinalize(number)` — `1` → `"st"` / `"1st"`

### Inflection rules

- Default English inflection rules (matching Rails defaults)
- `ActiveSupport::Inflector.inflections` API for custom rules
- Irregulars: `"person"` ↔ `"people"`, `"child"` ↔ `"children"`, etc.
- Uncountables: `"sheep"`, `"fish"`, `"series"`, `"species"`, etc.
- Acronyms: `"HTML"`, `"API"`, `"REST"`, etc.

### Migration path

- Replace inline `pluralize`/`singularize`/etc. in `base.ts` and
  `associations.ts` with imports from `@rails-ts/activesupport`
- Replace inline inflection in `naming.ts`

### Key Rails reference

- `activesupport/lib/active_support/inflector/`
- `activesupport/test/inflector_test.rb` (~150 tests)
- `activesupport/test/inflector_test_cases.rb` (test fixtures)

## String extensions

### `blank?` / `present?`

In TS, these become utility functions or a wrapper:

- `isBlank(value)` — `null`, `undefined`, `""`, `"  "` → `true`
- `isPresent(value)` — opposite of `isBlank`
- `presence(value)` — returns value if present, else `undefined`

### String manipulation

- `truncate(string, length, options)` — with `:omission`
- `truncateWords(string, count, options)`
- `squish(string)` — strip + collapse whitespace
- `indent(string, amount)`
- `safeConstantize(string)` — returns undefined instead of throwing

### Key Rails reference

- `activesupport/test/core_ext/string_ext_test.rb`
