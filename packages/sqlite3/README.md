# @blazetrails/sqlite3

The SQLite client, mirroring Ruby's sqlite3 gem (`vendor/sqlite3/v2.6.0`).

## `SQLite3.Constants`

`lib/constants.ts` holds only the members trails reads, nested as the gem nests them
(`lib/sqlite3/constants.rb`, `ext/sqlite3/sqlite3.c:158`):

| member                                                                             | read by                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Open.SHAREDCACHE`                                                                 | `SQLite3Adapter#isSharedCache` (`sqlite3_adapter.rb:473`); each engine's open |
| `Open.READWRITE`, `Open.CREATE`                                                    | activerecord's `sqlite3/transaction.test.ts`, the engine suites               |
| `ErrorCode.OK` … `ErrorCode.NOTADB`                                                | `status2klass` (`ext/sqlite3/exception.c:3-66`)                               |
| `ErrorCode.DONE`                                                                   | `Backup#step`                                                                 |
| `Optimize.DEBUG`, `ANALYZE_TABLES`, `LIMIT_ANALYZE`, `CHECK_ALL_TABLES`, `DEFAULT` | `pragmas.test.ts` (`Pragmas#optimize`)                                        |

## `SQLite3.ForkSafety`

`suppressWarningsBang` is `fork_safety.rb:59-61`, called at module scope by
`sqlite3-adapter.ts` as `sqlite3_adapter.rb:18` does.
