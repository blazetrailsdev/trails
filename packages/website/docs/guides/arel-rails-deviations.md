---
title: "Arel: Deviations from Rails"
description: How Trails' Arel package differs from Rails Arel — naming, call-time constant resolution, typed generics. No async deviations.
---

# Arel: Deviations from Rails

> **See also:** [Guides index](./index.md) · [ActiveModel deviations](./activemodel-rails-deviations.md) · [ActiveRecord deviations](./activerecord-rails-deviations.md)

Arel is the least-deviating package in Trails. It is a pure SQL AST builder
with no I/O, so JavaScript's async/single-threaded model has almost no impact.
The deviations here are mostly about Ruby idioms that don't translate
(symbols, `method_missing`, keyword args, call-time constant resolution) and TypeScript features we use to
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

## Call-time constant resolution: the zero-import slot

Ruby resolves a constant named inside a method body when the method _runs_, and
Zeitwerk autoloads the file at that moment. So `Arel::Nodes.build_quoted` can
name `Arel::Attributes::Attribute` (`casted.rb:47-59`) without `casted.rb`
taking a load-order dependency on it.

ESM has no equivalent: every `import` is eager, so naming a class in a method
body costs a module-evaluation edge — and in Arel those edges close cycles
whose members all `extend Node` / `extend Binary`, which throws
`Cannot access 'Binary' before initialization` depending on which module you
enter the graph through.

Where that happens, the constructor is read through a **zero-import slot
module**, `packages/arel/src/node-slots.ts`: it imports nothing, so it cannot
join a cycle, and it exports a mutable binding plus a setter that the defining
module calls at the bottom of its own body. Readers import the binding and use
it at call time — exactly where Ruby resolves the constant.

```ts
// nodes/binary.ts — Rails: left.is_a?(Arel::Attributes::Attribute)
if (_Attribute && this.left instanceof _Attribute) return block(this.left);
```

The narrowing itself is plain `instanceof`, the direct equivalent of Ruby's
`is_a?`; the slot only defers _which module the class arrives from_. This is a
pure-TS concern; Rails never needs it.

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
