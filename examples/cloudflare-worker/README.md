# trails on Cloudflare Workers

A minimal trails application bundled with esbuild and run on Cloudflare Workers (`nodejs_compat`), on
PostgreSQL reached through Hyperdrive. It has one controller (`PostsController`: `index`, and `create`
inside `Post.transaction`), one `.tse` view and one Active Record model, `Post`.

```bash
terraform -chdir=infra init
terraform -chdir=infra apply -var account_id=<cloudflare account id>   # Neon Postgres + Hyperdrive
pnpm run deploy   # posts table (psql), views + `trails build` + esbuild bundle, `wrangler deploy`
```

`pnpm run dev` serves the same bundle under `wrangler dev` (workerd) against a local Postgres:
`wrangler.jsonc`'s `localConnectionString` is `postgres://trails:trails@localhost:5432/trails`, or set
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Create the table with
`node db/setup.ts <url>`.

## Infrastructure (`infra/`)

Terraform creates the Hyperdrive config and, unless `database_url` is set, a Neon Postgres project.
`pnpm run deploy` (`scripts/deploy.sh`) reads its outputs, creates the `posts` table (`db/setup.ts`, through the trails PostgreSQL adapter), writes
`wrangler.deploy.jsonc` with the Hyperdrive id, and uploads the script with `wrangler deploy`, which also
enables its `workers.dev` subdomain. The script is the build's output, so wrangler and not Terraform
uploads it.

| Variable       | Default                    |                                                    |
| -------------- | -------------------------- | -------------------------------------------------- |
| `account_id`   | (required)                 | the Cloudflare account                             |
| `name`         | `trails-cloudflare-worker` | Hyperdrive config and Neon project name            |
| `postgres`     | `true`                     | create a Neon project                              |
| `database_url` | `null`                     | an existing Postgres URL instead of a Neon project |
| `neon_region`  | `aws-us-east-2`            |                                                    |

The applying identity needs `CLOUDFLARE_API_TOKEN` with Hyperdrive and Workers Scripts edit permissions
(wrangler reads the same token) and, for Neon, `NEON_API_KEY`. The database password is kept in the
Terraform state, so keep the state private.

## What a Worker needs that a Node server does not

Each of these was hit booting this app under workerd. Fixed in trails, worked around here, or filed:

| Breakpoint                                                                                                                                                  | Where it is handled                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import.meta.url` is undefined, so `new URL("./locale/en.js", import.meta.url)` throws at module evaluation                                                 | `bundle.mjs` defines it; filed as `worker-bundle-import-meta-url-undefined-in-workerd`                                                            |
| CommonJS `pg` `require`s Node built-ins                                                                                                                     | `bundle.mjs`'s `createRequire` banner, as in the Lambda example                                                                                   |
| workerd's `node:module` throws `ERR_METHOD_NOT_IMPLEMENTED` from `setSourceMapsSupport`                                                                     | fixed: ruby-compat's Node process adapter treats it as unsupported                                                                                |
| `delegate` compiles a call-site wrapper with `new Function`; Workers forbid code generation from strings                                                    | fixed: activesupport's `Delegation` falls back to a closure on `EvalError`                                                                        |
| libxml2-wasm compiles WebAssembly at run time (its inline binary, and `addFunction`), which Workers forbid; `action_view.require_nokogiri` loads it at boot | `bundle.mjs` bundles Nokogiri's extension empty, so nothing here parses HTML; filed as `nokogiri-extension-fails-in-workerd-runtime-wasm-compile` |
| Autoload roots, template lookup and `findRoot` read the filesystem, and a Worker's `/bundle` holds only uploaded modules                                    | `wrangler.jsonc` uploads `config.ts`, `app/**` and `config/*` as Text modules, which appear in workerd's virtual filesystem                       |
| `config/database.ts` is not on that filesystem (it is left out of the upload)                                                                               | the Worker sets `DATABASE_URL` from the Hyperdrive binding; `database_configuration` reads it when the file is absent, as Rails does              |
| A Hyperdrive binding cannot be read at module scope                                                                                                         | read in the first request, before boot                                                                                                            |
| A socket opened in one request cannot be used by another, so a pooled connection hangs the next request                                                     | `worker/index.ts` clears all connections at the end of each request; Hyperdrive does the pooling                                                  |
| Every boot reports it cannot open `/bundle/log/production.log` although `config.logger` is set                                                              | harmless; filed as `production-boot-opens-log-file-despite-config-logger`                                                                         |
| `flash()` is not a helper in the `.tse` view                                                                                                                | the view does not use it; filed as `flash-is-not-a-view-helper-in-tse-templates`                                                                  |
| `LibSQLRemoteAdapter` opens remote URLs through the native `libsql` addon                                                                                   | no libSQL arm; filed as `libsql-remote-adapter-native-addon-not-worker-capable`                                                                   |

D1 is not a target: it has no interactive transactions, which `transaction`, savepoints and
transactional fixtures need. The bundle is about 1.8 MB gzipped, inside the Workers paid-plan limit.
