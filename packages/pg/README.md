# @blazetrails/pg

A port of Ruby's [`pg`](https://github.com/ged/ruby-pg) gem
(`vendor/pg/v1.5.9`), the gem `postgresql_adapter.rb:3-4` requires. The gem's
API is ported by name; [`node-pg`](https://node-postgres.com) is the engine
underneath, as `@msgpack/msgpack` is for `@blazetrails/msgpack`. `pg` is an
optional peer dependency.

**Rule 1: only what trails calls** (`packages/ruby-compat/README.md`). The
package holds the gem members ActiveRecord's PostgreSQL adapter calls, and
nothing else (RFC 0186-pg-gem-port § "The surface"). `parity:api`'s `pg` row
counts only those; every other gem file is an `UNPORTED_FILES` row and every
other method a `SCOPED_SKIP_GROUPS` entry, each "not called by activerecord".

`pg.ts` is `PG::Constants` (`ext/pg.c:350`); `exceptions.ts` is
`lib/pg/exceptions.rb` plus the C error classes in `ext/pg_errors.c` and
`ext/errorcodes.def`.

## Surface

| member                            | gem definition                                       | called by                                                                |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `CONNECTION_OK`                   | `ext/pg.c:367`                                       | `postgresql_adapter.rb:313`                                              |
| `CONNECTION_BAD`                  | `ext/pg.c:369`                                       | returned by `Connection#status`                                          |
| `PQTRANS_IDLE`                    | `ext/pg.c:422`                                       | `postgresql/database_statements.rb:124`, `postgresql_adapter.rb:375`     |
| `PQTRANS_ACTIVE`                  | `ext/pg.c:424`                                       | returned by `Connection#transaction_status`                              |
| `PQTRANS_INTRANS`                 | `ext/pg.c:426`                                       | `postgresql/database_statements.rb:124`                                  |
| `PQTRANS_INERROR`                 | `ext/pg.c:428`                                       | `postgresql/database_statements.rb:124`, `postgresql_adapter.rb:850`     |
| `PG_DIAG_SEVERITY`                | `ext/pg.c:531`                                       | `postgresql_adapter.rb:969`                                              |
| `PG_DIAG_SQLSTATE`                | `ext/pg.c:550`                                       | `postgresql_adapter.rb:804,902,968`                                      |
| `PG_DIAG_MESSAGE_PRIMARY`         | `ext/pg.c:555`                                       | `postgresql_adapter.rb:967`                                              |
| `PG_DIAG_SOURCE_FUNCTION`         | `ext/pg.c:608`                                       | `postgresql_adapter.rb:903`                                              |
| the other 14 `PG_DIAG_*`          | `ext/pg.c:541-639`                                   | `PG::Result#error_field`'s field codes (`activerecord/lib/pg/result.ts`) |
| `Error`, `#connection`, `#result` | `lib/pg/exceptions.rb:9-15`, `ext/pg_errors.c:78-85` | `postgresql_adapter.rb:59,315,355,804,902`                               |
| `ServerError`                     | `ext/pg_errors.c:87`                                 | raised by the wrapper; `FeatureNotSupported`'s superclass                |
| `UnableToSend`                    | `ext/pg_errors.c:88`                                 | raised by the wrapper                                                    |
| `ConnectionBad`                   | `ext/pg_errors.c:89`                                 | `postgresql_adapter.rb:808,947`                                          |
| `FeatureNotSupported`             | `ext/errorcodes.def:49-50` (`0A000`)                 | `postgresql/database_statements.rb:142`                                  |
| `ERROR_CLASSES`                   | `ext/pg_errors.c:76`                                 | `lookup_error_class` (`ext/pg_errors.c:36-69`), in `engine/node-pg.ts`   |

The package defines only the SQLSTATE classes trails names. Adding one is a
class in `exceptions.ts` plus its `ERROR_CLASSES` rows from `ext/errorcodes.def`;
an unlisted SQLSTATE raises `ServerError`, as the gem does for one it lacks.

`connection.ts` is `PG::Connection` (`ext/pg_connection.c`); node-pg is reached
only through `engine/node-pg.ts`, which `PG.connect` loads by an awaited
`import()`, so a missing `pg` npm package raises `LoadError` there and nowhere
earlier. `type-map-all-strings.ts` (`ext/pg_type_map_all_strings.c`, the
map `pgconn_s_allocate` seats, `ext/pg_connection.c:262`), `type-map-by-oid.ts`,
`type-map-by-class.ts`, `simple-encoder.ts`,
`simple-decoder.ts` and `text-encoder/{integer,boolean}.ts` are the gem's type
maps and coders `add_pg_encoders` / `add_pg_decoders` build. The text decoders
still live in activerecord's `postgresql/pg-text-decoder.ts`.

The specs need a PostgreSQL server, so this package's tests run on CI's
PostgreSQL lane.
