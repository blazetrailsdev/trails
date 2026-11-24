# pg — Claude guide

Rules that bind only inside `packages/pg`. The repo-wide rules, the fidelity
standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md). A `§ "…"` reference below names a section of the
root file unless it names one in this file.

## The pg port carries only what trails calls (`PG::Connection`, `PG::Result`)

`@blazetrails/pg` wraps the `pg` npm client (node-pg) the way
`packages/bcrypt` wraps `bcryptjs`. The gem's Ruby files and its C extension
(`vendor/pg/v1.6.2/ext/`) define far more than Rails uses: large objects,
pipeline mode, the `sync_*` / `async_*` / `send_*` variants, SSL and trace
hooks, connection-info readers and `PG::Result`'s field accessors. Most of it
is libpq surface that node-pg, which speaks the wire protocol itself, does not
expose.

**A pg method is ported only when a trails caller needs it**: the
activerecord PostgreSQL adapter, actioncable's PostgreSQL subscription
adapter, or their Rails tests call it. Every other gem method stays unported,
and its `SCOPED_SKIP_GROUPS` entry (`scripts/parity/conventions.ts`,
`packages: ["pg"]`) is PERMANENT and cites this section. A missing pg method
is never filed as a porting story unless a trails caller has appeared.

`PG.library_version` is one of these callers' methods with no value to
return. It is `PQlibVersion()` (`vendor/pg/v1.6.2/ext/pg.c:246-250`), and
node-pg links no libpq. So it is skipped, and
`cancel_any_running_query`'s libpq-18 guard
(`activerecord/lib/active_record/connection_adapters/postgresql/database_statements.rb:135`)
is omitted under `@missingRailsCall library_version — PERMANENT`.

Ruled by the operator on 2026-11-22 (trails#10601).

On 2026-11-23 the operator widened the rule to the whole scored denominator:
every gem method `parity:api` scores, and every spec example `parity:test`
scores, is ported, pg 1.6's additions included (`close_prepared` /
`close_portal`, pipeline mode, chunked rows, `inspect`, the connect helpers).
A method or example kept out of scoring by its `SCOPED_SKIP_GROUPS` entry or
an unported-files row stays unported.
