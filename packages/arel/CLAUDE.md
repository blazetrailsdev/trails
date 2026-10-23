# arel — Claude guide

Rules that bind only inside `packages/arel`. The repo-wide rules are in the root
[CLAUDE.md](../../CLAUDE.md); the general rule for the shape below is its §
"Call-time constant resolution".

## Call-time constant resolution (arel)

`arel/src/namespaces.ts` holds the `Arel` / `Arel::Attributes` /
`Arel::Collectors` / `Arel::Nodes` / `Arel::Visitors` namespace objects. All but
`Collectors` are extended with `ActiveSupport::Autoload` (RFC 0151): Rails
`require`s the collectors (`arel.rb:19`, `collectors/sql_string.rb:3`) and
nothing reads one through the namespace at call time, so it carries no
`autoload`. Each autoloaded constant is seated by its defining module and read
as a property at call time (`new Nodes.Grouping(expr)`). The seat is a plain
assignment, `Nodes.Grouping = Grouping`, as `class Grouping < Unary` is in
`arel/nodes/grouping.rb:5`; the class's path (`Arel::Nodes::Grouping`) is
derived from the registered `Nodes` object on first read, so a seat carries no
path call. `Collectors`, `Nodes` and `Visitors` are also the public
`Arel.Collectors` / `Arel.Nodes` / `Arel.Visitors` exports: every class seats
itself on them in its defining module, and a type-only `declare namespace` of
the same name carries the type side. A seat is `Owner.Name = Klass` in every
package; the root rule's `const_set` exception covers the node classes
`binary.rb`, `unary.rb` and `function.rb` generate with `const_set`, and nothing
else in arel.
