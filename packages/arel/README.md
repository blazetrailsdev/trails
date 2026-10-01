# @blazetrails/arel

The trails port of Rails' Arel, the SQL AST that ActiveRecord builds every
query with (`vendor/rails/v8.0.2/activerecord/lib/arel`). It covers tables and
attributes, the node tree, predications, the select / insert / update / delete
managers, and the `ToSql` visitor with its SQLite, PostgreSQL and MySQL
subclasses, plus the `Dot` visitor.

## Status

As of 2026-09-27: 725 of 728 public Rails methods have a counterpart
(`pnpm parity:api --package arel --public-only`), and all 739 Rails Arel tests
are ported (`pnpm parity:test`). Its novel extra surface (public names with no
Rails counterpart) is pinned at zero, and its parameter names are gated
(`pnpm parity:api:extra:gate`, `pnpm parity:api:params`). The deliberate
differences from Rails are listed in the [Arel deviations guide](../website/docs/guides/arel-rails-deviations.md).

## Using it

As in Rails, Arel renders SQL through an engine, which supplies the connection
to quote with. `Arel::Table.engine` is normally the ActiveRecord base class, so
the usual entry point is a model's `arelTable`. This ran against SQLite:

```ts
const posts = Post.arelTable;

posts
  .project(posts.get("id"), posts.get("title"))
  .where(posts.get("status").gt(0).and(posts.get("title").matches("%rails%")))
  .order(posts.get("created_at").desc())
  .take(5)
  .toSql();
// SELECT "posts"."id", "posts"."title" FROM "posts" WHERE "posts"."status" > 0
//   AND "posts"."title" LIKE '%rails%' ORDER BY "posts"."created_at" DESC LIMIT 5

Post.where(posts.get("title").eq("Hello").or(posts.get("slug").eq("hi"))).toSql();
// SELECT "posts".* FROM "posts" WHERE ("posts"."title" = 'Hello' OR "posts"."slug" = 'hi')
```

Ruby's `table[:id]` is `table.get("id")`. Without an engine, `toSql()` fails
where Rails would, with a `TypeError` whose message starts
``undefined method `with_connection' for nil``. Set `Table.engine`, or pass
an engine to `toSql()`, to use Arel without ActiveRecord.

The package root exports `Table`, `Attribute`, the `Nodes`, `Visitors`,
`Attributes` and `Collectors` namespaces, the four managers, `sql`, `star` and
the Arel errors.

## Visitor dispatch reads class names

`Arel::Visitors::Visitor` derives the method to call from the visited object's
class at runtime, `:"visit_#{klass.name.gsub('::', '_')}"`
(`vendor/rails/v8.0.2/activerecord/lib/arel/visitors/visitor.rb:17-21`), and caches it
per visitor class. trails does the same. It reads `ctor.name`, plus the
class's branded Ruby nesting, since a JS constructor name carries no namespace,
in `packages/arel/src/visitors/ruby-class.ts`.

That makes the class names load-bearing at runtime. The published `dist/` is
unminified ESM, but a consumer bundling arel with **name mangling enabled** will
break visitor dispatch. Keep class names in any bundle that includes arel.
