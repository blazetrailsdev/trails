# @blazetrails/sqlite3

The SQLite client, mirroring Ruby's sqlite3 gem (`vendor/sqlite3/v2.6.0`).

## `SQLite3.Constants`

`lib/constants.ts` holds only the members trails reads, nested as the gem nests them
(`lib/sqlite3/constants.rb`, `ext/sqlite3/sqlite3.c:158`):

| member                                                                             | read by                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Open.READONLY`, `Open.SHAREDCACHE`                                                | `SQLite3Adapter#isSharedCache` (`sqlite3_adapter.rb:473`); each engine's open |
| `Open.READWRITE`, `Open.CREATE`                                                    | activerecord's `sqlite3/transaction.test.ts`, the engine suites               |
| `ErrorCode.OK` … `ErrorCode.NOTADB`                                                | `status2klass` (`ext/sqlite3/exception.c:3-66`)                               |
| `ErrorCode.DONE`                                                                   | `Backup#step`                                                                 |
| `Optimize.DEBUG`, `ANALYZE_TABLES`, `LIMIT_ANALYZE`, `CHECK_ALL_TABLES`, `DEFAULT` | `pragmas.test.ts` (`Pragmas#optimize`)                                        |

## `SQLite3.ForkSafety`

`suppressWarningsBang` is `fork_safety.rb:59-61`, called at module scope by
`sqlite3-adapter.ts` as `sqlite3_adapter.rb:18` does.

## `SQLite3.Database`

`lib/database.ts` is `lib/sqlite3/database.rb` with `Pragmas` included, over an `EngineDatabase`
that stands where the gem's C struct does (`ext/sqlite3/database.c`): the private `open_v2`
(`:962`), `exec_batch` (`:990`) and `disable_quirk_mode` (`:976`) reach it, as do `changes`,
`close`, `closed?` and `busy_handler` (`:965-983`). The constructor's `engine` option is the
`open_v2` an engine supplies; no driver supplies one yet.

`execute`, `query` and `get_first_value` (`database.rb:247,371,393`) are ported because `Pragmas`
calls the first and last (`pragmas.rb`), with `ResultSet` / `HashResultSet` (`lib/resultset.ts`)
and `Statement#execute` (`statement.rb:78`) beneath them. `Statement#types`
(`statement.rb:132-136`) reads the engine's `columnDecltype`.

`busyHandler` hands its block to the engine; no npm client exposes `sqlite3_busy_handler`, which
`sqlite3-busy-handler-has-no-client-counterpart` records.

Where two blocked stories land: `better-sqlite3-driver-ignores-strict-false` is the `strict:` arm
of `Database`'s constructor (`database.rb:170-172`), and
`libsql-remote-adapter-memory-placeholder-and-concurrency-override` is its first argument, the
`file` handed to `open_v2`.

The constructor ports `database.rb:141-195` for the options trails passes, including
`default_transaction_mode:` (`:179`, read by `transaction`) and `extensions:` (`:181`,
`initialize_extensions` over the engine's `loadExtensionInternal` / `enableLoadExtension`). It
leaves out `open16` and `utf16:` (`:145-146`: a JS string carries no encoding) and the block arm
(`:185-191`): a constructor creates no promise, and the block's `close` may be async.
