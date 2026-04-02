# ActiveModel: 100% API Coverage

**Status: 340/340 methods (100%), 62/62 files**

```bash
pnpm run api:compare -- --package activemodel
```

---

## Known Concerns

### Base.writeAttribute eagerly encrypts (architectural)

`Base.writeAttribute` encrypts on every call, but `Base.constructor` also
encrypts post-super. This means Model's constructor must call
`Model.prototype.writeAttribute.call(this, ...)` instead of
`this.writeAttribute(...)` to avoid double-encryption. In Rails,
`assign_attributes` dispatches through the receiver and encryption is handled
at the serialization layer, not at write time.

**Fix:** Move encryption out of `Base.writeAttribute` into the persistence
layer (serialize/valueForDatabase). Then Model's constructor can use
`this.writeAttribute` normally and `Base.constructor`'s post-super encryption
loop can be removed.

### undefineAttributeMethods can remove user-defined methods

`undefineAttributeMethods()` deletes properties directly off the prototype
for every generated name. If a user-defined method collides with a generated
attribute method name, it gets deleted too. In Rails, generated methods live
in a separate `generated_attribute_methods` module that can be replaced
wholesale without affecting user overrides.

**Fix:** Track generated method names in a Set per class, and only delete
those. Or generate methods onto a dedicated prototype layer object (matching
Rails' `generated_attribute_methods` module pattern).

### Test coverage for new AttributeSet methods

`castTypes`, `isKey`, `accessed`, `map`, `reverseMergeBang` were added to
`AttributeSet` but don't have dedicated tests in `attribute-set.test.ts`.
The methods are exercised indirectly through Model tests but should have
focused unit tests.

### Test coverage for new Attribute methods

`isSerializable`, `originalValueForDatabase`, `withUserDefault`, and the
now-public `typeCast` on `Attribute` don't have dedicated tests in
`attribute.test.ts`. Should add focused tests including the failure mode
when `UserProvidedDefault` hasn't been registered.
