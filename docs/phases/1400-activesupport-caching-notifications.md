# Phase 1400: ActiveSupport — Caching, Notifications, Configuration

**Goal**: Implement the infrastructure features that make Rails apps observable
and configurable.

## Caching

### Cache store API

- `MemoryStore` — in-process cache (default for dev/test)
- `NullStore` — no-op cache
- `read(key)`, `write(key, value, options)`, `delete(key)`
- `fetch(key, options, block)` — read-through caching
- `exist?(key)`
- `readMulti(...keys)` / `writeMulti(hash)`
- `fetchMulti(...keys, block)`
- `increment(key, amount)` / `decrement(key, amount)`
- `clear` — flush entire cache

### Cache options

- `expires_in:` — TTL
- `race_condition_ttl:` — stale-while-revalidate
- `namespace:` — key prefix
- `compress:` / `compress_threshold:`
- `version:` — cache key versioning

### Cache key generation

- `cacheKey()` on models — `"users/1-20260306"`
- `cacheKeyWithVersion()`
- Collection cache keys

### Key Rails reference

- `activesupport/test/caching/` (~300 tests)

## Notifications (ActiveSupport::Notifications)

An instrumentation/pub-sub system used by ActiveRecord for query logging.

### API to implement

- `subscribe(name, callback)` — listen for events
- `instrument(name, payload, block)` — fire an event around a block
- `unsubscribe(subscriber)`
- `monotonic_subscribe(name, callback)` — monotonic clock variant

### Standard events (used by ActiveRecord)

- `sql.active_record` — query execution
- `instantiation.active_record` — record instantiation
- `start_processing.action_controller` — request start
- `cache_read.active_support` — cache operations

### Key Rails reference

- `activesupport/test/notifications_test.rb` (~80 tests)

## Configuration (ActiveSupport::Configurable)

### API to implement

- `config` object on classes
- `configAccessor(name, options)` — define config attribute
- `config.x.custom_key` — nested custom configuration
- Inheritance of config from parent classes

### OrderedOptions

- `OrderedOptions` — hash that raises on missing keys with `!` suffix
- `InheritableOptions` — inherits from parent

### Key Rails reference

- `activesupport/test/configurable_test.rb`
- `activesupport/test/ordered_options_test.rb`

## CurrentAttributes

Thread-safe per-request attributes (useful for current user, request ID, etc.).

### API to implement

- `attribute(...names)` — declare attributes
- `instance` — per-context singleton
- `reset` — clear all attributes
- `set(attrs, block)` — set attributes for duration of block
- `before_reset` / `after_reset` callbacks

### Key Rails reference

- `activesupport/test/current_attributes_test.rb`
