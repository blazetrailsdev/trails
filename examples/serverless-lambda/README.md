# trails on AWS Lambda

A minimal trails application bundled into a single esbuild file and run on AWS Lambda (`nodejs26.x`,
arm64). It has one controller (`PostsController`), one `.tse` view and one Active Record model, `Post`,
on SQLite through the `node-sqlite` adapter, so the function ships no native addon.

```bash
pnpm run build          # views + `trails build` AOT maps + seed DB + esbuild bundle -> dist/handler.mjs
pnpm run package        # build/lambda.zip (bundle, libxml2-wasm, app/, config/, db/)
pnpm run invoke:local   # run it under public.ecr.aws/lambda/nodejs:26 (Runtime Interface Emulator)
LAMBDA_ROLE_ARN=arn:aws:iam::<account>:role/<role> pnpm run deploy   # function + public Function URL
```

The role only needs `AWSLambdaBasicExecutionRole`.

## How it is put together

- `serverless/lambda.ts` exposes an API Gateway v2 / Function URL `handler`, a fetch-style `fetch` and a
  raw `rack` entry. It boots during Lambda's INIT phase through `.trails/entry.generated.js`, which
  `trails build` writes. `serverless/rack-bridge.ts` is a copy of the website's
  `packages/website/src/lib/frontiers/rack-bridge.ts`.
- `bundle.mjs` replaces the drivers of adapters the app does not use with a stub that raises when it is
  loaded. esbuild hoists an external `import` to the top of an ESM bundle even when only a lazily
  imported adapter file reaches it, so marking a driver external would make it a load-time
  dependency.
- `libxml2-wasm` stays external. Its top-level await, which nokogiri → html-sanitizer → ActionView
  `Base` reach, breaks esbuild's lazy module initialisation.
- `/var/task` is read-only, so the seed DB is copied to `/tmp` at cold start, and the production logger
  writes to stdout.
