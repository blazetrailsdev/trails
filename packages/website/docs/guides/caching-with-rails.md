---
title: "Caching with Trails: An Overview"
description: Fragment caching in templates, low-level caching through Trails.cache, the SQL query cache, Solid Cache and the other cache stores, cache keys, and conditional GET.
---

# Caching with Trails: An Overview

> **See also:** [Guides index](./index.md) ·
> [activesupport package](/packages/activesupport) ·
> [actionview package](/packages/actionview) ·
> [solid-cache package](/packages/solid-cache)

The cheapest work is work you do not repeat. This guide covers the places a
Trails application can keep a result and hand it back next time:

- Fragment caching in templates, including collections and nested fragments.
- Low-level caching of any value through `Trails.cache`.
- The SQL query cache Active Record keeps during a request.
- Solid Cache, the database-backed default store, and the other stores.
- How cache keys are built.
- Conditional GET, which lets a browser keep a response it already has.

## What is Caching?

Caching keeps the result of a computation, a rendered partial or a database
read, so the next request for the same thing skips the work. The hard part is
never storing; it is knowing when a stored value is no longer true. Most of
what follows is about keys that change when the underlying data changes, so an
old entry is simply never read again.

## Types of Caching

Caching is off in development by default. Run `trails dev:cache` to toggle it;
it creates or removes `tmp/caching-dev.txt`, which the generated
`config/environments/development.ts` checks at boot.

### Fragment Caching

A page is usually made of pieces that change at different rates. Fragment
caching stores one piece of rendered output under a key. In a `.tse` template
the `cache` helper takes a key object and a block:

<!-- typecheck:skip -->

```ts
<% await context.cache(product, {}, async () => { %>
  <%= await context.render(product) %>
<% }) %>
```

The helper builds the key from the record (its cache key and version) plus a
digest of the template, so editing either the record or the template moves to a
new key. `cacheIf` and `cacheUnless` take a condition first and cache only when
it allows.

Templates are compiled ahead of time and do not run through Ruby's ERB, which
is why the helper is reached through `context` and every block is async; see
[CLAUDE.md, "Templates are precompiled"](https://github.com/blazetrailsdev/trails/blob/main/packages/actionview/CLAUDE.md#templates-are-precompiled-templatecompiles-module_eval).

#### Collection Caching

Rendering a collection with `cached: true` reads every item's fragment in one
`readMulti` call instead of one read per item, and writes only the misses.

### Russian Doll Caching

Fragments can nest: a product fragment inside a category fragment. When a
product changes, its key changes, but the outer category fragment still holds
the old inner HTML. The fix is to make the inner change move the outer key too:
declare the association with `touch: true`, so saving a product updates its
category's `updated_at`, and the category's cache version with it.

```ts
import { Base } from "@blazetrails/activerecord";

export class Product extends Base {
  static {
    this.belongsTo("category", { touch: true });
  }
}
```

### Shared Partial Caching

A partial rendered for more than one format, such as HTML and a mail's text
part, caches separately per format, because the template digest is part of the
key.

### Low-Level Caching using `Trails.cache`

For anything that is not a view, use the store directly. `Trails.cache` is the
store the application configured, and `fetch` is the call to reach for: it
returns the cached value, or runs the block, stores the result and returns it.

```ts
import { Trails } from "@blazetrails/trailties";

const rate = await Trails.cache!.fetch("usd-eur-rate", { expiresIn: 3600 }, async () => {
  return 0.92;
});
```

Every store method is async, since a store may sit on a database or a network.
The plain operations are `read`, `write`, `delete` and `isExist`, with
`readMulti`, `writeMulti` and `fetchMulti` for batches:

```ts
import { Trails } from "@blazetrails/trailties";

const cache = Trails.cache!;
await cache.write("greeting", "hello");
await cache.read("greeting");
await cache.delete("greeting");
```

#### Avoid Caching Instances of Active Record Objects

Cache ids or plain values, not records. A cached record is a snapshot: it does
not see later updates, and after a code reload its class is not the one the
application now uses. Store the ids and load the records again:

```ts
import { Trails } from "@blazetrails/trailties";

const ids = await Trails.cache!.fetch(
  "super-admin-ids",
  { expiresIn: 600 },
  async () => (await User.where({ superAdmin: true }).pluck("id")) as number[],
);
const superAdmins = await User.where({ id: ids }).toArray();
```

### SQL Caching

During a request Active Record caches the result of each `SELECT`. Running the
same query again in that request returns the cached rows without touching the
database, and any write clears the cache. It lives only as long as the request.

Outside a request, a block can turn the cache on or off explicitly:

```ts
await Post.cache(async () => {
  await Post.find(1);
  await Post.find(1); // served from the query cache
});

await Post.uncached(async () => {
  await Post.find(1); // always hits the database
});
```

## Managing Dependencies

A fragment's key includes a digest of its template _and of the templates it
renders_, so changing a partial invalidates every fragment that contains it.

### Implicit Dependencies

The digest finds the partials a template renders by reading its `render`
calls. A call whose partial name is a literal or a record is found
automatically.

### Explicit Dependencies

When the partial name is computed at run time, the digest cannot see it.
Name it with a `Template Dependency:` comment in the template so it is still
part of the digest.

### External Dependencies

A helper's output is not part of the template digest. If a cached fragment
depends on what a helper returns, include that in the key yourself, or change
the key by hand when the helper changes.

## Solid Cache

Solid Cache is the default store for a new application in production: a cache
kept in a database table rather than in memory. It holds far more than a
memory store can, survives restarts, and needs no extra service. trails ports
the gem as [`@blazetrails/solid-cache`](/packages/solid-cache).

### Configuring the Database

`trails solid-cache:install` writes `config/cache.ts` and the schema for the
cache table. The config names the database the entries are stored in, one
block per environment:

<!-- typecheck:skip -->

```ts
const defaults = {
  database: "cache",
  storeOptions: {
    maxSize: 256 * 1024 * 1024,
    namespace: Trails.env.toString(),
  },
};

export default {
  development: { ...defaults },
  test: { ...defaults },
  production: { ...defaults },
};
```

The `cache` database is a separate entry in `config/database.ts`, so cache
traffic does not compete with the primary database's connections.

### Customizing the Cache Store

`storeOptions` is passed to the store. `maxSize` caps the table in bytes and
`maxAge` caps how long an entry may live; `namespace` prefixes every key, so
environments sharing one database do not collide.

### Handling Cache Expiration

Solid Cache does not expire entries with a timer. After a number of writes it
runs its expiry job, which deletes the oldest entries once the table is over
`maxSize` or they are older than `maxAge`.

### Sharding the Cache

Several databases can share the load: list them as shards in the config, and
the store spreads keys across them with a consistent hash, so adding a shard
moves only a fraction of the keys.

## Other Cache Stores

### Configuration

The store is chosen with `config.cacheStore`, a store name with a leading colon
followed by its options:

```ts
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  this.config.cacheStore = [":memory_store", { size: 64 * 1024 * 1024 }];
});
```

### `ActiveSupport::Cache::Store`

The base class every store extends. It owns the shared behavior, `fetch`,
namespacing, expiry and compression, and leaves reading and writing an entry to
the subclass.

### `ActiveSupport::Cache::MemoryStore`

Keeps entries in the process's memory, bounded by `size` (32 MB by default),
evicting the least recently used. Fast, but every process has its own copy and
it is lost on restart. The generated development environment uses it.

### `ActiveSupport::Cache::FileStore`

Writes each entry to a file under a directory, `tmp/cache/` by default. It is
shared by processes on one machine and survives a restart.

### `ActiveSupport::Cache::RedisCacheStore`

Stores entries in Redis, shared by every process and machine pointed at it.
The store wraps the npm Redis client, so it is selected with
`:redis_cache_store` and a `url`.

### `ActiveSupport::Cache::NullStore`

Accepts every write and finds nothing. Use it in tests or development to run
the code paths with caching effectively off.

### Custom Cache Stores

Extend `Store` and implement its entry methods, then assign an instance to
`config.cacheStore` directly instead of a name.

## Cache Keys

A key can be a string, a record or an array of them. A record contributes its
`cacheKey`, such as `products/5`, and, with cache versioning on, a separate
`cacheVersion` built from `updated_at`; the store compares the version on read,
so an updated record misses without the key itself changing. Arrays are joined
with `/`, and a namespace, if configured, is prefixed.

## Conditional GET Support

Conditional GET lets the browser keep a response: the server sends an `ETag`
or `Last-Modified` header, the browser sends it back on the next request, and
if nothing has changed the server answers `304 Not Modified` with no body.

In a controller, `freshWhen` sets those headers from a record or explicit
values and answers 304 when the request is already fresh. `isStale` does the
same and returns whether the action still has to render:

<!-- typecheck:skip -->

```ts
async show() {
  const product = await Product.find(this.params.id);
  if (await this.isStale(product)) {
    await this.render({ plain: product.name });
  }
}
```

### Strong v/s Weak ETags

Etags are weak by default (`W/"..."`), meaning the response is equivalent, not
byte-for-byte identical, which suits gzipped or otherwise transformed
responses. Pass `strongEtag` instead of `etag` when a byte-identical promise
matters, as it does for range requests.
