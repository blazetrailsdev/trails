# @blazetrails/trailties

The trails port of Rails' railties: the `trails` command, generators, and the
application boot.

## Running under Bun

Node is the primary runtime. Bun **1.3 or later** is a second runtime
(RFC 0252). The `trails` bin keeps its `#!/usr/bin/env node` shebang, so run it
through Bun explicitly:

```sh
bun trails new blog      # from an installed @blazetrails/trailties
bunx trails new blog     # without installing it first
cd blog
bun trails db:migrate
bun trails server
```

Packages are still installed with pnpm; `bun install` is not supported.

Under Bun, `adapter: sqlite3` in `config/database.yml` uses `bun:sqlite`
(better-sqlite3 is a V8 addon Bun cannot load), so the file does not change.
`bun:sqlite` registers no user-defined SQL functions, aggregates or
authorizer, and always accepts double-quoted string literals.

Zeitwerk does not run on Bun yet: Bun 1.3 has no `node:module`
`registerHooks`, so the autoloader's generation hook cannot be installed, and
booting an application raises `NotImplementedError` until RFC 0252's
`zeitwerk-hooks-via-bun-plugin` lands.
