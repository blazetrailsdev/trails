# @blazetrails/mysql2

A port of Ruby's [`mysql2`](https://github.com/brianmario/mysql2) gem
(`vendor/mysql2/0.5.6`), the gem `mysql2_adapter.rb:3-4` requires. The gem's
API is ported by name; the npm [`mysql2`](https://sidorares.github.io/node-mysql2/)
client is the engine underneath, as node-pg is for `@blazetrails/pg`. `mysql2`
is an optional peer dependency.

**Rule 1: only what trails calls** (`packages/ruby-compat/README.md`). The
package holds the gem members ActiveRecord's MySQL adapter calls, and nothing
else (RFC 0254-mysql2-gem-port § "The measured split"). `parity:api`'s `mysql2`
row counts only those; `em.rb`, `field.rb` and `mysql2.rb` are `UNPORTED_FILES`
rows and every other Ruby-defined method a `SCOPED_SKIP_GROUPS` entry, each
"not called by activerecord".

`mysql2.ts` is the `Mysql2` module, seated on `TopLevel`; `error.ts` is
`lib/mysql2/error.rb`. `Client`, `Result` and `Statement` still live in
`packages/activerecord/lib/mysql2/` until
`mysql2-client-result-statement-move-to-the-package` moves them here.

## Surface

| class               | defined in C                                                                                                                                                                 | defined in Ruby                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mysql2::Client`    | 12: `close`, `closed?`, `ping`, `server_info`, `escape`, `last_id`, `affected_rows`, `prepare`, `set_server_option`, `abandon_results!`, `automatic_close=`, `warning_count` | 8: `default_query_options`, `initialize`, `parse_flags_array`, `parse_connect_attrs`, `query`, `local_offset`, `query_options`, `read_timeout` |
| `Mysql2::Result`    | 4: `each`, `fields`, `free`, `size` (alias of `count`)                                                                                                                       | 0 (`to_a` is `Enumerable`)                                                                                                                     |
| `Mysql2::Statement` | 2: `affected_rows`, `close`                                                                                                                                                  | 1: `execute`                                                                                                                                   |
| `Mysql2::Error`     | 0                                                                                                                                                                            | 7, all of `error.rb`: `initialize`, `new_with_args`, `clean_message`, `error_number`, `sql_state`, `errno`, `error`                            |

The C-defined members keep their gem names and are unscored.
