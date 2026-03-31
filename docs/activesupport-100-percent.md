# ActiveSupport: Road to 100%

## Current state

| Metric              | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| API classes/modules | **116 / 306** (37.9%) — 3 misplaced, 187 missing      |
| Test coverage       | **2,229 / 2,862** (77.9%) — 549 skipped, 12 misplaced |

The primary measure is `api:compare`, which checks that every Rails class and module has a corresponding TypeScript export. `test:compare` tracks behavior coverage.

```bash
pnpm run api:compare -- --package activesupport   # API surface
pnpm run test:compare -- --package activesupport   # test parity
```

## API parity: what's missing (187 classes/modules)

### Highest impact (4+ missing classes per file)

| Rails file                        | Missing | What's needed                                               |
| --------------------------------- | ------- | ----------------------------------------------------------- |
| core_ext/object/json              | 12      | JSON encoding extensions for all Ruby types                 |
| core_ext/object/blank             | 6       | Object, NilClass, FalseClass, TrueClass, Array, Hash blank? |
| messages/serializer_with_fallback | 6       | MessageEncryptor/Verifier serializer chain                  |
| cache/serializer_with_fallback    | 5       | Cache serializer chain (Marshal, JSON, etc.)                |
| tagged_logging                    | 4       | TaggedLogging module + formatter classes                    |
| encrypted_file                    | 4       | EncryptedFile + supporting classes                          |
| deprecation/proxy_wrappers        | 4       | DeprecatedObjectProxy, InstanceVariableProxy, ConstantProxy |
| core_ext/erb/util                 | 4       | ERB::Util html_escape helpers                               |

### Medium impact (2–3 missing)

| Rails file                               | Missing | What's needed                                       |
| ---------------------------------------- | ------- | --------------------------------------------------- |
| notifications/instrumenter               | 3       | Instrumenter, Event, InstrumentationRegistry (1 OK) |
| encrypted_configuration                  | 3       | EncryptedConfiguration + helpers                    |
| cache/coder                              | 3       | Cache::Coder, Encoder32Bit, Decoder32Bit            |
| cache/strategy/local_cache               | 3       | LocalCache, LocalStore, middleware                  |
| concurrency/load_interlock_aware_monitor | 3       | Monitor + thread interlock                          |
| syntax_error_proxy                       | 3       | SyntaxErrorProxy for debugging                      |
| xml_mini/\*                              | 8       | XML engine adapters (Nokogiri, LibXML, REXML, etc.) |
| testing/\*                               | 15      | Test helpers, isolation, parallelization            |
| json/encoding                            | 2       | JSONGemEncoder, EscapedString                       |
| deprecation/behaviors                    | 2       | Behavior registry + defaults                        |
| delegation                               | 2       | Delegator, MethodDelegation                         |
| duration/iso8601_parser                  | 2       | ISO8601 duration parsing                            |
| code_generator                           | 2       | CodeGenerator, MethodSet                            |
| core_ext/hash/conversions                | 2       | Hash#to_xml, Hash.from_xml                          |
| core_ext/object/try                      | 2       | try, try! method delegation                         |
| core_ext/object/duplicable               | 3       | Duplicable refinements                              |
| log_subscriber + test_helper             | 3       | LogSubscriber, TestHelper                           |
| message_pack/\*                          | 4       | MessagePack serialization                           |

### Single missing classes (1 each, 100+ files)

The remaining ~130 missing are single-class files. Major categories:

- **Number helpers** (9 files): NumberConverter and 8 format-specific converters
- **Message infrastructure** (6 files): Rotator, RotationCoordinator, Metadata, Codec, etc.
- **Core extensions** (15+ files): acts_like, bytes, conversions, concern, etc.
- **Deprecation** (5 files): Deprecator, Reporting, MethodWrappers, Disallowed, etc.
- **Dependencies/Autoload** (4 files): Dependencies, Interlock, RequireDependency, Autoload
- **Concurrency** (2 files): ShareLock, LoadInterlockAwareMonitor
- **Cache stores** (2 files): MemCacheStore, RedisCacheStore

## API parity: what's done (116 classes/modules)

31 files fully matched (✓):

ActionableError, ArrayInquirer, BacktraceCleaner, BroadcastLogger, Cache::Entry, Cache::FileStore, Cache::NullStore, ClassAttribute, Concern (×3), Concurrency::NullLock, Configurable (×2), ConfigurationFile (×2), CurrentAttributes, Deprecation, Digest, EnvironmentInquirer, ErrorReporter, ErrorReporter::TestHelper, Gzip (×2), HashWithIndifferentAccess, KeyGenerator (×2), LazyLoadHooks, MessageVerifier (×2), Notifications, OrderedHash, OrderedOptions (×2), ParameterFilter, SecurityUtils, StringInquirer, TimeWithZone, TimeZone

## Misplaced (3)

These exist but in the wrong file location:

| Current location | Should be                | Class     |
| ---------------- | ------------------------ | --------- |
| cache/index.ts   | cache.ts                 | Store     |
| range-ext.ts     | core-ext/enumerable.ts   | Range     |
| inflector.ts     | inflector/inflections.ts | Inflector |

## Recommended work order

### Batch 1: Core extensions and utilities (high ROI, no external deps)

1. **core_ext/object/blank** (6 classes) — blank?/present? for all types
2. **core_ext/erb/util** (4 classes) — html_escape, already partially implemented in output-safety
3. **core_ext/object/try** (2 classes) — try/try! delegation, already have tryCall
4. **core_ext/object/duplicable** (3 classes) — duplicable? checks
5. **core_ext/hash/conversions** (2 classes) — Hash#to_xml, Hash.from_xml
6. **delegation** (2 classes) — Delegator, MethodDelegation
7. **deep_mergeable** (1 class) — DeepMergeable mixin

### Batch 2: Logging and instrumentation

8. **tagged_logging** (4 classes) — already have taggedLogging function, need module/class exports
9. **log_subscriber** (1+2 classes) — LogSubscriber + TestHelper
10. **notifications/instrumenter** (3 missing) — extend existing Notifications

### Batch 3: JSON and serialization

11. **core_ext/object/json** (12 classes) — JSON encoding for all Ruby types
12. **json/encoding** (2 classes) — JSONGemEncoder, EscapedString
13. **messages/serializer_with_fallback** (6 classes) — serializer chain
14. **cache/serializer_with_fallback** (5 classes) — cache serializer chain
15. **cache/coder** (3 classes) — cache encoding/decoding

### Batch 4: Deprecation framework

16. **deprecation/proxy_wrappers** (4 classes) — proxy wrappers
17. **deprecation/behaviors** (2 classes) — behavior registry
18. **deprecation/** (remaining 5 files) — Deprecator, Reporting, etc.

### Batch 5: Encryption and messages

19. **encrypted_file** (4 classes) — EncryptedFile
20. **encrypted_configuration** (3 classes) — EncryptedConfiguration
21. **message_pack/** (4 classes) — MessagePack serialization
22. **messages/** (remaining 6 files) — Rotator, Metadata, Codec, etc.

### Batch 6: Number helpers

23. **number_helper** (9 files) — NumberConverter base + 8 format converters

### Batch 7: Duration and time

24. **duration/iso8601_parser** (2 classes) — ISO8601 parsing
25. **duration/iso8601_serializer** (1 class) — ISO8601 output

### Not applicable / deferred

- **testing/** (15 files) — Ruby test framework integration, not directly applicable
- **concurrency/share_lock** — thread-based, no JS equivalent
- **fork_tracker** — process forking, no JS equivalent
- **xml_mini engines** (8 files) — would need XML library dependency
- **cache/mem_cache_store, redis_cache_store** — need external adapters
- **railtie, i18n_railtie** — Rails boot integration
- **dependencies, autoload** — Ruby autoloading, not applicable
