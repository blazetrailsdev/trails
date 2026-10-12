# A module namespace object's `[[Prototype]]` is not `null`, so prototype walks never terminate

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
