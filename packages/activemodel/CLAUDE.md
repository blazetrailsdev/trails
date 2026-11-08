# activemodel — Claude guide

Rules that bind only inside `packages/activemodel`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.
A `§ "…"` reference below names a section of the root file unless it names
one in this file.

## Serialization's dual sync/async hash (`serializable_hash` / `as_json`)

Ruby's `serializable_add_includes`
(`activemodel/lib/active_model/serialization.rb:191`) reads an association
synchronously — `if records = send(association)` — and `CollectionProxy#to_ary`
lazily loads it in-line at `serialization.rb:143`. In trails an association read
is async, so an `include:`-bearing `serializable_hash` cannot be fully
synchronous.

**The settled answer is the dual-shape return** — `thenableHash` in
`activemodel/src/serialization.ts` builds a Proxy that is both a plain hash and
a `PromiseLike`. Read a key off it and you get the synchronous hash, where an
unloaded `include:` fails loud rather than silently serializing nothing;
`await` it and the includes are lazily loaded first, which is where Ruby's
in-line `to_ary` load lands. `asJsonThenable` is the same shape for
`ActiveModel::Serializers::JSON#as_json`
(`activemodel/lib/active_model/serializers/json.rb:96-110`), and
`serializableHash`'s third parameter is the module-private sync re-entry flag
the Proxy calls back through.

The alternative — `serializableHash` / `asJson` returning `Promise`
unconditionally — was rejected because `asJson` is the recursive dispatcher
behind the whole JSON encoder (`activesupport/lib/core-ext/object/json.ts`,
standing in for Ruby's `as_json` method lookup, with ~19 definitions feeding
it): an async `asJson` makes every collection containing a model async, the
encoder async, and **`to_json` a `Promise`** where Rails' returns a String — a
fidelity loss at a more prominent surface than the thenable it would remove,
and one that still needs a synchronous path for `JSON.stringify`. The
`JSON.stringify` → `toJSON` path is not the binding constraint: on that path
`toJSON` calls `asJson()` with no options, so there is no `include:` to load.
There is no third shape, because `to_json` is Rails-facing API.

This is a genuine language shortcoming — JS has no synchronous await and no
lazily-loading collection read — and it is ratified repo-wide here.
`thenableHash` and `asJsonThenable` carry `@noRailsEquivalent PERMANENT`
receipts against this section, and the module-private `preloadIncludes`, the
`SerializableHash` type and the `sync` re-entry parameter exist to serve them.
Do not re-derive the decision per call site, and do not file a story to make
them `Promise`.
