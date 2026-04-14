---
title: "Arel: Deviations from Rails"
description: How Trails' Arel package differs from Rails Arel — naming, symbol branding, typed generics. No async deviations.
---

# Arel: Deviations from Rails

> **See also:** [Guides index](./index.md) · [ActiveModel deviations](./activemodel-rails-deviations.md) · [ActiveRecord deviations](./activerecord-rails-deviations.md)

Arel is the least-deviating package in Trails. It is a pure SQL AST builder
with no I/O, so JavaScript's async/single-threaded model has almost no impact.
The deviations here are mostly about Ruby idioms that don't translate
(symbols, `method_missing`, keyword args) and TypeScript features we use to
add safety Rails can't.

If you know Rails Arel, you already know Trails Arel. The shapes are
intentionally identical: `Table`, `SelectManager`, `Nodes`, `Attribute`,
visitors, and so on.

## Naming and arguments

Arel inherits the cross-cutting conventions described in the guides
index: [method casing](./index.md#method-casing) (camelCase everywhere) and
[symbols/kwargs → options objects](./index.md#symbols-kwargs). So Ruby's
`Arel::Table.new(:users, as: "u")` becomes `new Table("users", { as:
"u" })`. Nothing Arel-specific about this.

## Symbol branding instead of class checks

Rails Arel relies on Ruby's class system (`is_a?`) and duck typing
(`respond_to?`) to identify node kinds. We can't rely on `instanceof` across
module boundaries (multiple copies of a class can coexist across bundles), so
core node types are branded with `Symbol.for(...)` and detected by symbol
presence.

- See `packages/arel/src/nodes/binary.ts` for the `ATTRIBUTE_BRAND`
  pattern. `isAttribute(node)` checks the branded symbol rather than
  `instanceof Attribute`.

This is a pure-TS concern; Rails never needs it.

## No `method_missing`, no Proxy

Rails Arel uses `method_missing` in a few places (notably for attribute
access on `Arel::Table`: `users[:id]`). We don't use `Proxy` anywhere in
Arel. TypeScript can't express a `Table#[]` method the way Ruby does, so
`Table` exposes explicit accessors that take a string and return an
`Attribute`:

```ts
// Rails:  users[:id]
// Trails: users.get("id")   // or: users.attr("id")
```

Both are defined in `packages/arel/src/table.ts`. We considered a
`Proxy`-backed `Table` that would make `users.id` work, but chose the
explicit accessor because the Proxy would defeat TypeScript's property
checking on the surrounding class. Typing wins over syntax.

## Generic typing of nodes

TypeScript lets us parameterize nodes where Rails just stores `Object`. A
`SelectManager<T>` knows the row shape it eventually produces, `Attribute<T>`
carries its column type, and visitor return types are inferred. This is
purely additive — Rails behavior is unchanged — and is the main reason
writing queries in Trails feels safer than in Rails.

## Sync vs async

Arel is 100% synchronous in both Rails and Trails. Nothing in `packages/arel`
returns a `Promise`. I/O happens in ActiveRecord's adapters, not here.

## What is _not_ different

- AST node shape and naming (`Nodes::SelectStatement` → `SelectStatement`,
  same fields).
- Visitor pattern (`ToSql`, per-dialect subclasses).
- `Table`, `SelectManager`, `InsertManager`, `UpdateManager`,
  `DeleteManager` all have the same roles.
- Predicate factories on `Attribute` (`eq`, `notEq`, `in`, `matches`, etc.)
  mirror Rails method for method.

## Summary

| Area                | Rails                       | Trails                                          |
| ------------------- | --------------------------- | ----------------------------------------------- |
| Method names        | snake_case                  | camelCase                                       |
| Arguments           | Ruby keyword args / symbols | Option objects / strings                        |
| Node identity       | `is_a?` / `respond_to?`     | `Symbol.for` brands                             |
| Dynamic attr access | `method_missing` on `Table` | Explicit `table.get("id")` / `table.attr("id")` |
| Async               | N/A (sync)                  | Same — still sync                               |
| Typing              | Dynamic                     | Generic `SelectManager<T>`, `Attribute<T>`      |
