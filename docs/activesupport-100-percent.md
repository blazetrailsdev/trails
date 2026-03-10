# ActiveSupport: Road to 100% Test Coverage

Current state: **21.4%** real (606 matched / 2,826 total Ruby tests), 2,209 stubs remaining.

## How coverage is measured

The compare script (`npm run test:compare`) extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized description. A "stub" is an `it.skip()` that matched a Ruby test name. The goal is 0 stubs.

## Current status by test file

### Complete (100% pass rate) — 318 tests across 12 files

| File | Tests | | File | Tests |
|---|---|---|---|---|
| duration | 79 | | notifications | 37 |
| callbacks | 54 | | logger | 31 |
| ordered-options | 28 | | try | 23 |
| number-helper | 21 | | lazy-load-hooks | 15 |
| key-generator | 10 | | parameter-filter | 8 |
| array-inquirer | 7 | | string-inquirer | 5 |

### Partial progress

| File | Passing / Total | Stubs |
|---|---|---|
| time_ext | 66 / 119 | 53 |
| hash_ext | 49 / 93 | 44 |
| deprecation | 46 / 80 | 34 |
| range_ext | 43 / 47 | 4 |
| ordered-hash | 34 / 42 | 8 |
| error-reporter | 29 / 32 | 3 |
| safe-buffer | 19 / 41 | 22 |
| time_with_zone | 203 / 179 | — |
| time_zone | 203 / 108 | — |
| concern | 2 / 17 | 15 |

### Needs work (0% — stubs only)

| File | Stubs | Notes |
|---|---|---|
| string_ext | 147 | String extensions (inflection, encoding, etc.) |
| hash_with_indifferent_access | 93 | HWIA edge cases |
| multibyte_chars | 76 | Unicode/multibyte handling |
| date_time_ext | 68 | DateTime extensions |
| test_case | 62 | Test framework utilities |
| date_ext | 56 | Date extensions |
| module | 53 | Module extensions |
| inflector | 48 | Inflection edge cases |
| xml_mini | 47 | XML serialization |
| json/encoding | 46 | JSON encoding edge cases |
| broadcast_logger | 37 | Multi-destination logging |
| cache/mem_cache_store | 35 | Memcached cache store |
| numeric_ext | 33 | Numeric extensions |
| enumerable | 29 | Enumerable extensions |
| tagged_logging | 29 | Tagged logging |
| cache/redis_cache_store | 28 | Redis cache store |
| time_travel | 27 | Time travel helpers |
| array/conversions | 25 | Array conversion helpers |
| share_lock | 25 | Thread-safe locking |

Plus 60+ smaller files with < 25 stubs each.

## Recommended next targets

### Highest ROI (most stubs, foundational)

1. **string_ext** (147 stubs) — Many are inflection tests that may already work
3. **hash_with_indifferent_access** (93 stubs) — Core data structure, used everywhere
4. **inflector** (48 stubs) — Pluralize/singularize edge cases
5. **json/encoding** (46 stubs) — JSON serialization

### Medium effort, good payoff

6. **time_ext** (53 stubs remaining) — Already 55% done
7. **hash_ext** (44 stubs remaining) — Already 53% done
8. **deprecation** (34 stubs remaining) — Already 57% done
9. **safe_buffer** (22 stubs) — HTML-safe string handling
10. **cache stores** (mem_cache 35, redis 28, file 14, memory 13, null 12) — Cache backends

### Lower ROI / complex

- **multibyte_chars** (76 stubs) — Unicode normalization, Ruby-specific encoding
- **date/time extensions** (68 + 56 + 21 stubs) — Requires TimeZone infrastructure
- **xml_mini** (47 stubs) — XML parsing/serialization
- **test_case** (62 stubs) — Test framework utilities
- **share_lock** (25 stubs) — Thread concurrency primitives

## Tracking progress

```
npm run test:compare
```

Target: `activesupport: 100% real (2826 matched, 0 stub / 2826 total)`
