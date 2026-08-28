# @blazetrails/arel

The trails port of Rails' `arel` (`vendor/rails/activerecord/lib/arel`).

## Visitor dispatch reads class names

`Arel::Visitors::Visitor` derives the method to call from the visited object's
class at runtime — `:"visit_#{klass.name.gsub('::', '_')}"`
(`arel/visitors/visitor.rb:17-21`) — and caches it per visitor class. trails
does the same, reading `ctor.name` (plus the class's branded Ruby nesting, since
a JS constructor name carries no namespace) in
`packages/arel/src/visitors/ruby-class.ts`.

That makes the class names load-bearing at runtime. The published `dist/` is
unminified ESM, but a consumer bundling arel with **name mangling enabled** will
break visitor dispatch. Keep class names in any bundle that includes arel.
