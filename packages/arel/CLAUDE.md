# arel — Claude guide

Rules that bind only inside `packages/arel`. The repo-wide rules are in the root
[CLAUDE.md](../../CLAUDE.md); the general rule for the shape below is its
§ "Call-time constant resolution".

## Call-time constant resolution (arel)

`arel/src/namespaces.ts` holds the `Arel` / `Arel::Attributes` /
`Arel::Collectors` / `Arel::Nodes` / `Arel::Visitors` namespace objects. All but
`Collectors` are extended with `ActiveSupport::Autoload` (RFC 0151): Rails
`require`s the collectors (`arel.rb:19`, `collectors/sql_string.rb:3`) and
nothing reads one through the namespace at call time, so it carries no
`autoload`. `Collectors`, `Nodes` and `Visitors` are also the public
`Arel.Collectors` / `Arel.Nodes` / `Arel.Visitors` exports, and a type-only
`declare namespace` of the same name carries the type side.

**arel's cycle is real, and almost none of its reads need the namespace.**
Converting arel's reads to direct imports puts 65 of its 92 modules in one
cycle cluster — `nodes/node.ts` reads `Nodes.Not` while `nodes/unary.ts`
imports `node.ts` for `class Unary extends Node`. It is still a plain
`import { Not } from "./unary.js"`, because `Node#not` runs long after both
module bodies finish (root CLAUDE.md § "Call-time constant resolution"). 278 of
arel's 287 namespace reads are deferred that way; the 9 module-eval reads are 8
erased `T extends Nodes.X` type positions, which are `import type`, and one
alias seat.

A seat is a plain `Nodes.Not = Not` assignment, type-checked against the
namespace's declared property. The generated node classes in `nodes/binary.ts`,
`nodes/unary.ts` and `nodes/function.ts` keep `rbModConstSet`, because Rails
builds them with `const_set name, Class.new(Binary)`
(`activerecord/lib/arel/nodes/binary.rb:122`, `unary.rb:41`, `function.rb:42`)
— a computed name with no declaration to assign at. A class's qualified Ruby
path is a ruby-compat internal, read only to print it (root CLAUDE.md
§ "Constant lookup is an import or a registry"), not the seat.
