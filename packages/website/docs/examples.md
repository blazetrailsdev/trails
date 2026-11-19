---
title: Examples
description: trails applications deployed on a single server, on AWS Lambda and on Cloudflare Workers.
---

# Examples

Each example is a complete trails application in the repository's
[`examples/`](https://github.com/blazetrailsdev/trails/tree/main/examples) directory, with its build and
deployment scripts. Its README records what the target needed and what it does not support yet.

| Example                                                                                                  | Runs on                                     | Database                      | Infrastructure                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------- | --------------------------------------------- |
| [twelve-dollar-server](https://github.com/blazetrailsdev/trails/tree/main/examples/twelve-dollar-server) | one small VM, `trails server` on Node       | SQLite                        | shell scripts                                 |
| [serverless-lambda](https://github.com/blazetrailsdev/trails/tree/main/examples/serverless-lambda)       | AWS Lambda (`nodejs26.x`), one esbuild file | SQLite, or RDS PostgreSQL     | Terraform (`aws`)                             |
| [cloudflare-worker](https://github.com/blazetrailsdev/trails/tree/main/examples/cloudflare-worker)       | Cloudflare Workers (`nodejs_compat`)        | PostgreSQL through Hyperdrive | Terraform (`cloudflare`, `neon`) and wrangler |
