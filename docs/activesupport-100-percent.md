# ActiveSupport: Road to 100%

Current state: **23.8%** API (336 / 1,411 methods). **77.9%** tests (2,229 / 2,862).

```bash
pnpm run api:compare -- --package activesupport
pnpm run api:compare -- --package activesupport --missing
```

---

## 19 fully matched files

actionable error, array inquirer, class attribute, concurrency/null lock, configuration file, core_ext/object/duplicable, core_ext/object/try, delegation, digest, environment inquirer, gzip, number helper converters (7), security utils.

## Biggest gaps (1,100 missing methods)

| Area                | Missing | Notes                                                                                                                       |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Core extensions     | ~300    | array (access 29, extract_options 37, conversions, grouping, wrap), hash, string, object, module, range, numeric, date/time |
| Cache               | ~75     | cache.rb (26), local_cache (16), redis (12), memcache (7), coder (6), serializer (4)                                        |
| Notifications       | ~40     | fanout, instrumenter, event                                                                                                 |
| Encryption/messages | ~35     | message encryptor/verifier internals, rotator, metadata                                                                     |
| Deprecation         | ~30     | behaviors, proxy wrappers, reporting, method wrappers                                                                       |
| Testing             | ~25     | test helpers, parallelization — Ruby-specific, may defer                                                                    |
| XML                 | ~20     | xml_mini engines — needs XML library, may defer                                                                             |
| Concurrency         | ~15     | share_lock, load_interlock — thread-based, limited JS applicability                                                         |
| Code generation     | ~10     | CodeGenerator, MethodSet — Ruby metaprogramming                                                                             |
| Other               | ~550    | scattered across 100+ files                                                                                                 |

## Not applicable / defer

- **testing/** — Ruby test framework integration
- **concurrency/share_lock** — thread-based, no JS equivalent
- **fork_tracker** — process forking
- **xml_mini engines** — would need XML library dependency
- **dependencies, autoload** — Ruby autoloading
- **railtie, i18n_railtie** — Rails boot integration
