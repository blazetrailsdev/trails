# TypeScript + trails

A port of [`submissions/ruby-rails-gambitboy`](https://github.com/arjaythedev/twelve-dollar-server-challenge/tree/main/submissions/ruby-rails-gambitboy)
(full Rails 8.1) onto trails, the TypeScript re-implementation of Rails. Each file mirrors the Rails file
of the same name: `app/controllers/posts-controller.ts` is `posts_controller.rb`,
`app/models/concerns/post/likeable.ts` is `post/likeable.rb`, and so on.

|                     |                                                                              |
| ------------------- | ---------------------------------------------------------------------------- |
| Language            | TypeScript, run by Node.js 24.21.0 (native type stripping)                   |
| Framework           | trails (trailties application, Action Controller API, Active Record, router) |
| Server              | `@blazetrails/rack`'s Node handler (`node:http`), via `trails server`        |
| SQLite driver       | better-sqlite3 12                                                            |
| JWT                 | HS256 verifier on `node:crypto` (`lib/jwt.ts`)                               |
| **Nginx or direct** | **Nginx**: behind `bench/nginx.conf`, the server on `127.0.0.1:3000`         |

## Running it

```bash
sudo bash install.sh   # Node.js 24 into /opt/node
bash build.sh          # pnpm install + build of the trails packages this app uses
SQLITE_PATH=... JWT_SECRET=... HOST=127.0.0.1 PORT=3000 bash start.sh
```

## How it's built

The same as the Rails app:

- **Active Record models** `User`, `Post` and `Like` map the fixed schema. `Like` has a composite primary
  key, and timestamps are off, so `created_at` comes from the column default.
- **Post reads** are one query: `Post.withDetails()` joins the author and selects `like_count` as a
  correlated subquery.
- **Likes** are a primary-key lookup of the post, then `Like.insert(..., { returning: [":post_id"] })`.
- **Validation** lives on `Post`: `normalizes` trims the body, `validates` carries the spec's messages.
- **JWT** is verified on every request: signature, `alg === "HS256"`, numeric `exp` (and `nbf` when
  present), and UTF-8 header and payload segments.
- **Pragmas**: WAL, `synchronous=NORMAL`, `foreign_keys=ON`, plus 512 MiB `mmap_size` and a 64 MiB page
  cache, from `config/database.ts`.
- **Unused middleware removed** in `config/application.ts`, the same list as the Rails app.

## Local measurement

One core, against the Rails app this ports, on the same machine (2026-10-28). Each server was pinned to
one core with `taskset -c 3` and started from a fresh seed copy, and passed `test/test.sh` (42/42) first.
`ab -k -c 16 -n 10000` ran on four other cores, after a 5,000-request warm-up per path. Each figure is
the mean of three runs. CPU µs/req is 1,000,000 / req/s, since the pinned core was saturated.

|                                                        | `GET /posts/250000`      | `GET /feed`              |
| ------------------------------------------------------ | ------------------------ | ------------------------ |
| Rails 8.1.4, Ruby 4.0.5 + YJIT, Puma 8.0.2 (3 threads) | 1,180 req/s, ~850 µs/req | 946 req/s, ~1,060 µs/req |
| trails, Node.js 24.21.0                                | 527 req/s, ~1,900 µs/req | 406 req/s, ~2,460 µs/req |

These figures predate the framework performance work merged since (#9427, #9428, #9430, #9437, #9446,
#9482). They have not been re-measured under the same conditions, so treat them as a floor for trails.
