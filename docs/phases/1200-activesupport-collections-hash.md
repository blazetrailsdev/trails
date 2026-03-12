# Phase 1200: ActiveSupport — Collections & Hash Utilities

**Goal**: Implement the collection utilities and hash extensions that Rails code
relies on throughout.

## HashWithIndifferentAccess

Used extensively in params, serialization, and configuration.

### API to implement

- `new HashWithIndifferentAccess(hash)` — wraps a plain object
- String and symbol keys are interchangeable
- `get(key)`, `set(key, value)`, `delete(key)`, `has(key)`
- `merge(other)`, `deepMerge(other)`
- `toHash()` — convert back to plain object
- `slice(...keys)`, `except(...keys)`

In TypeScript, this is probably best implemented as a `Map`-like class or a
`Proxy` wrapper rather than mimicking Ruby's hash access.

### Key Rails reference

- `activesupport/lib/active_support/hash_with_indifferent_access.rb`
- `activesupport/test/hash_with_indifferent_access_test.rb`

## Hash extensions

Utility functions operating on plain objects:

- `deepMerge(target, source)` — recursive merge
- `deepDup(obj)` — deep clone
- `slice(obj, ...keys)` — pick keys
- `except(obj, ...keys)` — omit keys
- `deepTransformKeys(obj, fn)` — recursive key transformation
- `deepStringifyKeys(obj)` / `deepSymbolizeKeys(obj)` (camelCase/snake_case)
- `extractOptions(args)` — pop hash from end of args array (Rails convention)

### Key Rails reference

- `activesupport/test/core_ext/hash_ext_test.rb`

## Array extensions

- `wrap(value)` — `null` → `[]`, `[1]` → `[1]`, `1` → `[1]`
- `inGroupsOf(array, n, fillWith)` — split into groups
- `to_sentence(array, options)` — `["a","b","c"]` → `"a, b, and c"`
- `including(...values)` / `excluding(...values)`
- `inquiry(array)` — creates `StringInquirer`-like object

### Key Rails reference

- `activesupport/test/core_ext/array/`

## Enumerable extensions

- `sum(collection, fn)` — sum with mapper
- `indexBy(collection, fn)` — group by key (one per key)
- `groupBy(collection, fn)` — group by key (array per key)
- `pluck(collection, key)` — extract values
- `maximum(collection, fn)` / `minimum(collection, fn)`
- `inBatchesOf(collection, size)` — yield chunks
- `compactBlank(collection)` — remove blank values

### Key Rails reference

- `activesupport/test/core_ext/enumerable_test.rb`
