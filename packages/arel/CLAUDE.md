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
`autoload`. Each autoloaded constant is seated by its defining module and read
as a property at call time (`new Nodes.Not(this)`). The seat is the constant
binding, `rbModConstSet(Nodes, "Not", Not)`: as Ruby's `const_set` does
(`vendor/ruby/v3.3.11/variable.c:3648-3668`), binding a class under a named
owner is what paths it (`Arel::Nodes::Not`), so a seat carries no separate path
call. `Collectors`, `Nodes` and `Visitors` are also the public
`Arel.Collectors` / `Arel.Nodes` / `Arel.Visitors` exports: every class seats
itself on them in its defining module, and a type-only `declare namespace` of
the same name carries the type side. This is the shape every package's plain
`Owner.Name = klass` assignment and any remaining slot converge onto.
