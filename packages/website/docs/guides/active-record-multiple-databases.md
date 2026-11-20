---
title: Multiple Databases
description: Running a Trails application against more than one database — configuration, models per database, replicas and role switching, horizontal sharding, and the limits that come with it.
---

# Multiple Databases

> **See also:** [Guides index](./index.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [Active Record Migrations](./active-record-migrations.md) ·
> [activerecord package](/packages/activerecord)

An application can grow past one database: a second database for one part of
the domain, read replicas to spread load, or shards that split one table's rows
across servers. This guide covers:

- Describing several databases in `config/database.ts`.
- Pointing models at a database through an abstract class.
- Migrations and generators for a second database.
- Switching between writer and reader roles, by hand or per request.
- Horizontal sharding and shard switching.
- What does not work across databases.

## Setting up Your Application

With one database, each environment in `config/database.ts` is a single
configuration. With several, it is an object keyed by name. `primary` is the
default; any other name is your choice. A replica is marked `replica: true`,
which also keeps the database tasks from creating or migrating it.

<!-- typecheck:skip -->

```ts
export default {
  production: {
    primary: {
      adapter: "postgresql",
      database: "app_primary",
      username: "app",
    },
    primaryReplica: {
      adapter: "postgresql",
      database: "app_primary",
      username: "app_readonly",
      replica: true,
    },
    animals: {
      adapter: "postgresql",
      database: "app_animals",
      username: "app",
      migrationsPaths: "db/animals_migrate",
    },
    animalsReplica: {
      adapter: "postgresql",
      database: "app_animals",
      username: "app_readonly",
      replica: true,
    },
  },
};
```

Models connect through an abstract class. `ApplicationRecord` connects to
`primary`, and a second abstract class connects to `animals`:

```ts
import { Base } from "@blazetrails/activerecord";

class ApplicationRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

await ApplicationRecord.connectsTo({ database: { writing: "primary", reading: "primaryReplica" } });

class AnimalsRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

await AnimalsRecord.connectsTo({ database: { writing: "animals", reading: "animalsReplica" } });

class Dog extends AnimalsRecord {}
```

`connectsTo` is async, because establishing a pool is. Call it at boot, before
the first query; it may only be called on `Base` or an abstract class. Every
model that extends `AnimalsRecord` shares its pools. Connect each database
from exactly one class: a second class connecting to the same database opens
a second pool.

## Connecting to Databases without Managing Schema and Migrations

A database your application only reads, owned by another system, can set
`databaseTasks: false`. The database tasks then never create, migrate or dump
it.

## Generators and Migrations

Migrations for a non-primary database live in the directory its
`migrationsPaths` names. Pass `--database` to a generator to place the file
there and give the model the right abstract parent:

```sh
bin/trails generate migration CreateDogs name:string --database animals
bin/trails generate model Dog name:string --database animals --parent AnimalsRecord
```

The database tasks gain one variant per database, so `db:migrate` runs every
database and `db:migrate:animals` runs one.

## Activating Automatic Role Switching

The `DatabaseSelector` middleware sends GET and HEAD requests to the reading
role and everything else to the writing role. After a write it keeps reads on
the primary for a delay, so a user sees their own change. Enable it in
`config/initializers/multi-db.ts`, which `bin/trails generate active-record:multi-db`
creates with the options commented in. The delay is in seconds, and the
default resolver stores the last-write time in the session.

## Using Manual Connection Switching

`connectedTo` runs a function against a role and restores the previous role
when it returns. Inside it, a write on the reading role raises.

```ts
import { Base } from "@blazetrails/activerecord";

await Base.connectedTo({ role: "reading" }, () => User.where({ active: true }).toArray());
```

`whilePreventingWrites` keeps the current role but raises on any write, which
is useful for checking that a code path is read-only:

```ts
import { Base } from "@blazetrails/activerecord";

await Base.whilePreventingWrites(() => User.count());
```

## Horizontal Sharding

Shards split rows of the same schema across databases. Each shard has its own
writer and, optionally, reader. Declare them with `shards` instead of
`database`; the first shard is the default.

```ts
import { Base } from "@blazetrails/activerecord";

class ShardRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

await ShardRecord.connectsTo({
  shards: {
    default: { writing: "primary", reading: "primaryReplica" },
    shardOne: { writing: "primaryShardOne", reading: "primaryShardOneReplica" },
  },
});

await ShardRecord.connectedTo({ role: "reading", shard: "shardOne" }, () => User.first());
```

`connectedToAllShards` runs the function once per shard and returns every
result.

## Activating Automatic Shard Switching

The `ShardSelector` middleware picks a shard per request from a resolver you
supply, a function from the request to a shard name, typically a lookup of
the tenant by host. With `lock: true` the request cannot switch shards
again. Configure both in the multi-db initializer.

## Granular Database Connection Switching

`connectedTo` on `Base` switches every connection class. Calling it on an
abstract class switches only the models under it, so one part of the
application can read from a replica while another keeps writing.
`connectedToMany` switches a list of classes at once, and `connectingTo` sets
a class's role or shard for the rest of the current context without a block.

### Handling Associations with Joins across Databases

A SQL join cannot reach a table in another database. For a `hasMany` or
`hasOne` with `through:`, pass `disableJoins: true` and Active Record runs one
query per hop instead of a join:

```ts
import { Base } from "@blazetrails/activerecord";

class Yard extends Base {
  static {
    this.hasMany("dogs");
    this.hasMany("treats", { through: "dogs", disableJoins: true });
  }
}
```

### Schema Caching

Each database has its own schema cache. Set `schemaCachePath` on a
database's configuration to load a dumped cache for it at boot.

## Caveats

### Load Balancing Replicas

Active Record does not balance load across several replicas of one role.
Put a load balancer or proxy in front of them and point the replica
configuration at it.

### Transactions

A transaction belongs to one connection. Opening one on `ApplicationRecord`
does not cover writes through `AnimalsRecord`, and nothing makes the two commit
together.
