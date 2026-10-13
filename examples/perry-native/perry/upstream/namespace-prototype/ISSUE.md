# A module namespace object's `[[Prototype]]` is not `null`, so prototype walks never terminate

> **MERGED upstream, 2026-10-13.**
>
> - issue: https://github.com/PerryTS/perry/issues/12587 — closed as completed
> - PR: https://github.com/PerryTS/perry/pull/12588 — merged into `main` as
>   `39bea98d`, **verbatim**: the merged file is byte-identical to what was
>   submitted.
>
> Re-verified against a build of pristine upstream `main` at `39bea98d` with no
> local patch — the reproducer below answers `null` in one step, matching Node,
> and the 59-module `extend(target, namespace)` case runs to completion.
>
> Kept as the local record and as a regression probe: `./run.sh` should now
> agree between Node and Perry.

**Perry `main` @ `d74498b2` (0.5.1659)**, built from source, Linux x86_64,
LLVM 22.1.8. Also present in the published 0.5.1520.

ECMA-262 specifies module namespace exotic objects with a `[[Prototype]]` of
`null`, so walking the prototype chain of an `import * as X` binding
terminates after one step. Under Perry the walk never terminates: each
`Object.getPrototypeOf` returns a further non-null `[object Module]`.

Any library that walks an object's prototype chain spins forever when handed a
module namespace.

## Reproducer

Two files, plain JavaScript, no dependencies — `./run.sh` runs both engines.

`mod.js`

    export function a() {}
    export function b() {}

`probe.js`

    import * as Mod from "./mod.js";
    let p = Mod, steps = 0;
    while (p !== null && p !== undefined && steps < 12) {
      p = Object.getPrototypeOf(p);
      steps++;
    }
    console.log(steps, String(Object.getPrototypeOf(Mod)));

### Expected (`node probe.js`)

    steps to reach null       : 1
    getPrototypeOf(Mod)       : null
    getPrototypeOf(Mod)===null: true

### Actual (`perry compile probe.js -o probe && ./probe`)

    steps to reach null       : 12          <-- only the guard stops it
    getPrototypeOf(Mod)       : [object Module]
    getPrototypeOf(Mod)===null: false

The chain is unbounded rather than cyclic: `getPrototypeOf(Mod) !== Mod`, and
one level further is also non-null, so each call appears to produce a fresh
`Module` object. Without the `steps < 12` guard the loop does not end.

## How it was found, and why it matters

This is the live blocker on compiling a [trails](https://github.com/blazetrailsdev/blazetrails)
application natively. A 362-module binary compiles and links, then never
starts — it spins at 100% of one core with no output.

`PERRY_DEBUG_INIT=1` placed it: 172 of 362 module initializers run, the last
being `activesupport/dist/namespaces.js`, whose top-level code is

    import * as Autoload from "./dependencies/autoload.js";
    extend(ActiveSupport, Autoload);

`extend` is ruby-compat's implementation of Ruby's `Object#extend`, and it
walks the prototype chain of the module it is given — which is this bug. Node
finishes it instantly; Perry does not finish it at all.

So the surface is not exotic: `import * as X` passed to anything that
traverses prototypes. Reducing it took the chain
362-module app → `namespaces.js` → `extend(target, namespace)` (59 modules)
→ these two files.

## Proposed fix

[`fix.patch`](fix.patch) — 12 added lines in
`crates/perry-runtime/src/object/namespace_create.rs`.

`js_finalize_namespace` is the one chokepoint for both namespace paths (the
static `import * as` populator reaches it directly; `js_create_namespace`, the
dynamic-`import()` builder, ends by calling it). It already stamps
`MODULE_NAMESPACE_CLASS_ID` and prevents extensions. The patch additionally
marks the object `OBJ_FLAG_NULL_PROTO`:

    let gc = crate::gc::header_from_trusted_user_ptr(obj.cast()).cast_mut();
    (*gc)._reserved |= crate::gc::OBJ_FLAG_NULL_PROTO;

Nothing else is needed, because that flag is already the proof
`Object.getPrototypeOf` reads to answer `null` — its own definition says so
("object was created with a null prototype … `Object.getPrototypeOf` returns
null for these"), and `object_ops/prototype.rs` honours it in both of its
resolution paths. The flag-setting idiom is copied from
`native_payload_birth.rs`.

This also explains the shape of the bug: `getPrototypeOf` has a
`NATIVE_MODULE_CLASS_ID` arm that exists precisely to stop this
non-termination for `require("path")` namespaces (the comment there cites a
turbopack `interopEsm` proto-walk runaway). A static ESM namespace carries a
different class id and never had the equivalent guard.

### Verification

Built from source at `main` `d74498b2` with LLVM 22.1.8.

| Case                                                 | Before                                                | After                                       |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| this reproducer                                      | walk never ends; `getPrototypeOf` → `[object Module]` | **1 step, `null` — byte-identical to Node** |
| `extend(target, namespace)`, 59 modules              | hangs                                                 | **runs**                                    |
| `activesupport/namespaces.js`, 359 modules           | hangs                                                 | **runs**                                    |
| the original trails probe, 362 modules + WebAssembly | hangs at 172/362 initializers                         | **runs**                                    |
| `ruby-compat` rung, 54 modules (control)             | ran                                                   | **still runs**                              |

Regressions: none found. `cargo test -p perry-runtime` run serially, patched
versus pristine, same filters:

| Filter      | Pristine             | Patched              |
| ----------- | -------------------- | -------------------- |
| `namespace` | —                    | 29 passed, 0 failed  |
| `prototype` | 244 passed, 1 failed | 244 passed, 1 failed |
| `shape`     | 557 passed, 4 failed | 557 passed, 4 failed |

The failures are identical in both and are all
`object::shape_store::tests::function_*`, i.e. pre-existing on `main` and
unrelated to namespaces. One `json::stringify_flat` test failed in a _parallel_
patched run and passes serially and in isolation both patched and pristine —
the suite's known parallel flakiness, not this change.

### Caveat worth a maintainer's eye

A null-prototype namespace no longer inherits from `Object.prototype`, so
`ns.hasOwnProperty(...)` and `ns.toString()` now throw. That is what Node does
too, so it is the spec-correct direction, but if any Perry interop shim calls
an `Object.prototype` method directly on a namespace it would need
`Object.prototype.x.call(ns)`. Nothing in the suites above tripped on it.
