# trails on AWS Lambda

A minimal trails application bundled into a single esbuild file and run on AWS Lambda (`nodejs26.x`,
arm64). It has one controller (`PostsController`), one `.tse` view and one Active Record model, `Post`,
on SQLite through the `node-sqlite` adapter, so the function ships no native addon, or on RDS PostgreSQL.

```bash
pnpm run build          # views + `trails build` AOT maps + seed DB + esbuild bundle -> dist/handler.mjs
pnpm run package        # build/lambda.zip (bundle, libxml2-wasm, app/, config/, config.ts, db/)
pnpm run invoke:local   # run it under public.ecr.aws/lambda/nodejs:26 (Runtime Interface Emulator)
pnpm run deploy         # terraform apply in infra/: function + public Function URL
```

## Infrastructure (`infra/`)

Terraform creates the function (`nodejs26.x`, arm64), a public Function URL and, unless `role_arn` is
set, an execution role. With `postgres = true` it also creates an RDS PostgreSQL instance in the
default VPC, two security groups that admit only the function on 5432, and a generated password, and it
seeds the database by invoking the function once with `{"seed": true}`.

| Variable            | Default                    |                                                                 |
| ------------------- | -------------------------- | --------------------------------------------------------------- |
| `region`            | `us-east-1`                |                                                                 |
| `name`              | `trails-serverless-lambda` | function, role and database name prefix                         |
| `memory_size`       | `1024`                     | MB                                                              |
| `role_arn`          | `null`                     | an existing execution role; creating one needs `iam:CreateRole` |
| `postgres`          | `false`                    | RDS PostgreSQL instead of the bundled SQLite file               |
| `db_instance_class` | `db.t4g.micro`             |                                                                 |

```bash
terraform -chdir=infra apply -var postgres=true
terraform -chdir=infra destroy
```

The applying identity needs Lambda permissions, `iam:PassRole` on the role, and, for `postgres`, RDS
and EC2 security-group permissions. The database password is kept in the Terraform state and the
function's environment, so keep the state private.

## How it is put together

- `serverless/lambda.ts` exposes an API Gateway v2 / Function URL `handler`, a fetch-style `fetch` and a
  raw `rack` entry. It boots during Lambda's INIT phase through `.trails/entry.generated.js`, which
  `trails build` writes. It reuses the website's `packages/website/src/lib/frontiers/rack-bridge.ts`.
- `bundle.mjs` replaces the drivers of adapters the app does not use with a stub that raises when it is
  loaded. esbuild hoists an external `import` to the top of an ESM bundle even when only a lazily
  imported adapter file reaches it, so marking a driver external would make it a load-time
  dependency.
- `libxml2-wasm` stays external. Its top-level await, which nokogiri → html-sanitizer → ActionView
  `Base` reach, breaks esbuild's lazy module initialisation.
- `/var/task` is read-only, so the seed DB is copied to `/tmp` at cold start, and the production logger
  writes to stdout.
- `config.ts` is the generated app's rackup file. `Application.findRoot` looks for it to find the app
  root, and the `trails build` boot map is rooted the same way.
- With `PGHOST` set, `config/database.ts` uses the `postgresql` adapter, with TLS through pg's own `ssl`
  option. The boot verifies one connection after `trails build`'s entry runs, as a workaround for
  `pg-first-model-read-after-boot-flush-hits-cold-type-map`.
