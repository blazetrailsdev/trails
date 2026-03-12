# Phase 1100: ActiveSupport — Callbacks & Concern

**Goal**: Extract and formalize the callback and mixin systems that ActiveModel
and ActiveRecord both rely on.

## Callbacks

Currently ActiveModel has its own callback system in `callbacks.ts`. This should
be extracted to ActiveSupport and shared.

### API to implement

- `defineCallbacks(name, options)` — register a callback chain
- `setCallback(name, kind, method, options)` — add a callback
  - `kind`: `:before`, `:after`, `:around`
  - `options`: `:if`, `:unless`, `:prepend`
- `skipCallback(name, kind, method)`
- `resetCallbacks(name)`
- `runCallbacks(name, block)` — execute the chain

### Callback options

- `:if` / `:unless` — conditional execution (symbol, proc, array)
- `:prepend` — add to front of chain
- `:on` — restrict to specific actions (`:create`, `:update`, `:destroy`)

### Halting

- Before callbacks returning `false` halt the chain (configurable)
- Around callbacks can skip `yield` to halt
- After callbacks never halt

### Key Rails reference

- `activesupport/lib/active_support/callbacks.rb`
- `activesupport/test/callbacks_test.rb` (~200 tests)

## Concern

A pattern for mixins that handles `included` blocks and `ClassMethods` modules.

### API to implement

```typescript
// TypeScript equivalent of ActiveSupport::Concern
function concern(mixin: {
  included?: (base: any) => void;
  classMethods?: Record<string, Function>;
  instanceMethods?: Record<string, Function>;
}): Mixin;
```

### Features

- `included` block runs when mixed in
- `ClassMethods` are added as static methods
- Dependency resolution (concerns depending on other concerns)
- `prepended` support

### Key Rails reference

- `activesupport/lib/active_support/concern.rb`
- `activesupport/test/concern_test.rb`

## ClassAttribute / CattrAccessor

Rails uses `class_attribute` extensively for inheritable class-level config.

### API to implement

- `classAttribute(name, options)` — creates a class-level attribute
  - Inherited by subclasses
  - `instance_writer: false` / `instance_reader: false`
  - `instance_predicate: true` — creates `name?` method
  - `default:` value

### Key Rails reference

- `activesupport/lib/active_support/core_ext/class/attribute.rb`
- `activesupport/test/class_attribute_test.rb`
