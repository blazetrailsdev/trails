# attributes/ + collectors/

## attributes/attribute.rb → attributes/attribute.ts — **OK with major DRIFT**

- Rails: `Attribute < Struct.new(:relation, :name)` — 6 methods total: `typeCaster`, `lower`, `typeCastForDatabase`, `ableToTypeCast?`. The rest comes from mixins (`Expressions`, `Predications`, `AliasPredication`, `OrderPredications`, `Math`).
- TS: `Attribute extends NodeExpression`. Each predicate method (eq/notEq/gt/gteq/lt/lteq/in/notIn/matches/doesNotMatch/matchesRegexp/doesNotMatchRegexp/between/notBetween/isDistinctFrom/isNotDistinctFrom/contains/overlaps/concat/`*Any`/`*All`/etc.) is implemented **directly on the class** rather than coming through the mixin. The Predications module is also imported.
- DRIFT: code duplication — `groupedAny`/`groupedAll` defined locally in `attribute.ts` and again in `predications.ts`. Behavior is the same; risk of drift if one is updated and not the other. Worth consolidating.
- DRIFT: TS's Attribute extends Node (so it can act as a node in the AST); Rails' Attribute is a Struct that gets mixed into NodeExpression behavior. The TS approach is correct for the visitor dispatch, but the file is much larger than Rails because every mixin method has an explicit impl rather than a single `import { Predications }` mixin install.
- ✅ Both `lower()` (`attribute.ts:457`) and `typeCaster` getter (`attribute.ts:99`) are present, matching Rails (`lower → relation.lower(self)`, `typeCaster → relation.typeForAttribute(name)`).
- EXTRA: `ATTRIBUTE_BRAND` symbol stamped on Attribute instances, used by `buildQuoted` and Binary's `fetchAttribute` helpers to detect attributes without a hard import cycle.

**Recommendation:** consider replacing the inline predicate methods on Attribute with `Object.assign(Attribute.prototype, Predications)` (or `include()` from activesupport) so there's a single source of truth. This is a meaningful cleanup but out-of-scope for an audit.

## collectors/

### bind.rb → bind.ts — **OK**

- Rails: `<<` (no-op), `addBind`, `addBinds`, `value`, `retryable`. TS has all (using `append` instead of `<<`).
- DRIFT: method-rename `<< → append`. api:compare needs map.
- DRIFT: TS `retryable` defaults to `true`; Rails has no default (nil/falsy). Verify behavior on consumers.

### composite.rb → composite.ts — **OK**

- All methods present: append (`<<`), addBind, addBinds, value (returns `[left, right]`), retryable, preparable.
- ✅ Resolved (PR #1120): `Composite#addBind` and `Composite#addBinds` now forward the `block` argument to both child collectors, matching Rails' `&block` forwarding.

### plain_string.rb → plain-string.ts — **OK**

### sql_string.rb → sql-string.ts — **OK**

- preparable, retryable, addBind (with block), addBinds. Match.
- DRIFT: TS adds default `?` substitution when no block passed; Rails always requires a block. Trails ergonomics.

### substitute_binds.rb → substitute-binds.ts — **OK**

- preparable, retryable, append, addBind, addBinds, value, quoter delegation. ✓
- TS additionally exports `SubstituteBindCollector` in a separate file (`substitute-bind-collector.ts`) — see extras.

## EXTRAS in collectors/

- `substitute-bind-collector.ts` — wrapper class around `SQLString` with quoter; not in Rails. Used by Trails for inline-bind rendering paths.
