# ActiveSupport: Road to 100% Test Coverage

Current state: **91.8%** (2,626 matched / 2,862 total Ruby tests). 150/157 files matched, 0 misplaced, 17 wrong describes.

## How coverage is measured

The compare script (`npm run convention:compare`) extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized description. "Skipped" means `it.skip()` stubs that match a Ruby test name. The goal is to convert all skips to real passing tests.

## What's left

### Missing files (7 files, 81 tests)

These files exist in Rails but have no TypeScript counterpart yet:

| Ruby file                         | Tests | Notes                          |
| --------------------------------- | ----- | ------------------------------ |
| i18n_test.rb                      | 21    | i18n integration               |
| core_ext/class/attribute_test.rb  | 19    | Class attribute extensions     |
| log_subscriber_test.rb            | 15    | Log subscriber                 |
| message_verifier_test.rb          | 10    | Message verifier (mostly done) |
| core_ext/object/deep_dup_test.rb  | 10    | Deep dup                       |
| security_utils_test.rb            | 4     | Security utilities             |
| core_ext/object/json_gem_encoding | 2     | JSON gem encoding              |

### Wrong describe (17 tests)

Tests that are in the correct file but under the wrong `describe` block name. These need their describe renamed to match the Ruby test class.

### Skipped tests (~1,008)

Tests that are `it.skip()` stubs matching Ruby test names. The biggest concentrations:

| Area              | Skipped | Notes                              |
| ----------------- | ------- | ---------------------------------- |
| time_ext          | ~88     | DST handling, time zone edge cases |
| time_with_zone    | ~52     | TimeWithZone calculations          |
| date_ext          | ~47     | Date calculation edge cases        |
| date_time_ext     | ~57     | DateTime extensions                |
| hash_ext          | ~44     | Hash deep merge, to_xml edge cases |
| share_lock        | ~25     | Thread concurrency (hard in JS)    |
| xml_mini          | ~31     | XML parsing edge cases             |
| mem_cache_store   | ~35     | Memcached store (needs adapter)    |
| redis_cache_store | ~27     | Redis store (needs adapter)        |
| inflector         | ~30     | Transliteration, locale-specific   |
| safe_buffer       | ~22     | HTML-safe string edge cases        |
| json/encoding     | ~17     | JSON encoding edge cases           |

## Recommended next targets

### Highest ROI

1. **core_ext/class/attribute** (19 tests) — Missing file, class_attribute is foundational
2. **i18n** (21 tests) — Missing file, i18n integration
3. **core_ext/object/deep_dup** (10 tests) — Missing file, small and self-contained
4. **message_verifier** (10 tests) — Mostly implemented, just needs the test file recreated

### Converting skips to real tests

5. **time_ext** (88 skipped) — Already 20 passing, DST/timezone edge cases
6. **hash_ext** (44 skipped) — Already 49 passing, deep merge and to_xml
7. **safe_buffer** (22 skipped) — Already 19 passing, HTML safety
8. **json/encoding** (17 skipped) — Already 29 passing, JSON edge cases

## Tracking progress

```bash
npm run convention:compare --package activesupport
```

Target: 2,862/2,862 tests matched, 0 skipped, 0 misplaced.
