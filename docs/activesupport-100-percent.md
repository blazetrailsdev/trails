# ActiveSupport: Road to 100% Test Coverage

Current state: **70.9%** (2,030 / 2,862 total Ruby tests). 678 skipped, 157/157 files matched, 0 misplaced.

## How coverage is measured

The compare script (`npm run convention:compare`) extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized description. "Skipped" means `it.skip()` stubs that match a Ruby test name. The goal is to convert all skips to real passing tests.

## What's left

### Biggest gaps (sorted by total missing + skipped)

| File                        | OK  | Skipped | Missing | Total |
| --------------------------- | --- | ------- | ------- | ----- |
| time-with-zone              | 95  | 8       | 76      | 179   |
| hash-ext                    | 44  | 44      | 5       | 93    |
| time-zone                   | 87  | 21      | 0       | 108   |
| xml-mini                    | 12  | 31      | 4       | 47    |
| mem-cache-store             | 0   | 35      | 0       | 35    |
| numeric-ext                 | 14  | 0       | 19      | 33    |
| redis-cache-store           | 0   | 27      | 1       | 28    |
| share-lock                  | 0   | 25      | 0       | 25    |
| inflector                   | 35  | 21      | 0       | 56    |
| date-and-time-compatibility | 0   | 21      | 0       | 21    |
| i18n                        | 0   | 21      | 0       | 21    |
| time-ext                    | 99  | 9       | 11      | 119   |
| xml-mini-engine             | 0   | 20      | 0       | 20    |
| string-ext                  | 130 | 17      | 1       | 148   |
| json/encoding               | 29  | 17      | 0       | 46    |
| number-helper-i18n          | 0   | 16      | 0       | 16    |
| encrypted-file              | 0   | 15      | 0       | 15    |
| log-subscriber              | 0   | 15      | 0       | 15    |
| message-encryptor           | 0   | 2       | 13      | 15    |
| array/conversions           | 13  | 12      | 0       | 25    |
| encrypted-configuration     | 0   | 12      | 0       | 12    |
| date-ext                    | 44  | 9       | 3       | 56    |
| tagged-logging              | 20  | 3       | 6       | 29    |

### Fully skipped files (0 passing tests)

These have test files but no passing tests yet:

- **mem-cache-store** (35 skipped) — needs memcached adapter
- **redis-cache-store** (27 skipped) — needs Redis adapter
- **share-lock** (25 skipped) — thread concurrency, fundamentally hard in JS
- **date-and-time-compatibility** (21 skipped)
- **i18n** (21 skipped) — i18n integration
- **xml-mini-engine** (20 skipped)
- **number-helper-i18n** (16 skipped) — depends on i18n
- **encrypted-file** (15 skipped) — encryption infrastructure
- **log-subscriber** (15 skipped)
- **encrypted-configuration** (12 skipped) — depends on encrypted-file

## Recommended next targets

### Highest ROI (big gap, mostly implementation work)

1. **time-with-zone** (76 missing, 8 skipped) — largest single gap by far, lots of recent momentum
2. **hash-ext** (44 skipped, 5 missing) — deep merge, to_xml edges, self-contained
3. **numeric-ext** (19 missing) — number formatting/conversions, no skips to convert
4. **inflector** (21 skipped) — transliteration, locale-specific rules
5. **string-ext** (17 skipped, 1 missing) — already at 130/148, close to done

### Medium effort

6. **time-zone** (21 skipped) — already at 87/108
7. **json/encoding** (17 skipped) — already at 29/46
8. **date-ext** (9 skipped, 3 missing) — already at 44/56
9. **tagged-logging** (3 skipped, 6 missing) — already at 20/29
10. **message-encryptor** (2 skipped, 13 missing) — crypto implementation

### Hard / blocked

- **mem-cache-store** (35) — needs external memcached adapter
- **redis-cache-store** (27) — needs external Redis adapter
- **share-lock** (25) — JS is single-threaded, concurrency primitives don't map well
- **encrypted-file / encrypted-configuration** (27 combined) — encryption infrastructure

## Tracking progress

```bash
npm run convention:compare -- --package activesupport
```

Target: 2,862/2,862 tests matched, 0 skipped, 0 misplaced.
