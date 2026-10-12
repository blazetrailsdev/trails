# `importedClass.prototype` reads `undefined` when the class is a class expression

**Perry 0.5.1520** (npm `@perryts/perry`), Linux x86_64, clang 23.1.3.

Reading `.prototype` directly off an imported binding returns `undefined` when
the exported value is a **class expression**. The same value read through a
local alias is correct, and a class **declaration** is correct, so the bug is
in the direct cross-module property read rather than in the class object.

## Reproducer

Two files, plain JavaScript, no dependencies — `perry/upstream/` in this repo,
runnable with `./run.sh`.

`a.js`

    export const K = class {};
    export class D {}

`b.js`

    /* global console */
    import { K, D } from "./a.js";
    const alias = K;
    console.log("K.prototype     (class expression, direct) :", typeof K.prototype);
    console.log("alias.prototype (class expression, alias)  :", typeof alias.prototype);
    console.log("D.prototype     (class declaration, direct):", typeof D.prototype);

### Expected (`node b.js`)

    K.prototype     (class expression, direct) : object
    alias.prototype (class expression, alias)  : object
    D.prototype     (class declaration, direct): object

### Actual (`perry compile b.js -o b && ./b`)

    K.prototype     (class expression, direct) : undefined     <-- wrong
    alias.prototype (class expression, alias)  : object
    D.prototype     (class declaration, direct): object

All three conditions are required: a class _expression_ (a declaration is
fine), read _directly_ on the import binding (an alias is fine), and _across a
module boundary_ (same-file is fine). `Object.getOwnPropertyNames(K)` still
reports `prototype`, and `new K()` still works — only this read is wrong.

## Suspected cause

`crates/perry-codegen/src/expr/property_get.rs:602` special-cases
`prototype`:

    if property == "prototype"
        && matches!(object.as_ref(), Expr::FuncRef(_) | Expr::Closure { .. })
    {
        // -> js_function_prototype_value_for_read
    }

A function's `prototype` is not a normal object field, so this call is what
makes the read work. An imported binding lowers to neither `FuncRef` nor
`Closure`, so the read falls through to the generic object-field lookup and
yields `undefined`. That also explains both negative controls: a local alias
is function-valued and takes the intended path, and a class declaration has a
real proto object materialised elsewhere (see the comment at
`crates/perry-hir/src/lower/expr_member.rs:1167`).

A static-shape test looks like the wrong guard here: whether the receiver is
callable is a runtime property. Routing `prototype` reads on a
runtime-callable receiver through `js_function_prototype_value_for_read` would
cover the imported case without enumerating lowering forms.

## Why it matters

Found while compiling a [trails](https://github.com/blazetrailsdev/blazetrails)
application. Its Ruby-compatibility layer builds classes in a factory —

    function rbDefineClass(name, superclass = Object) {
      const klass = class extends superclass {};
      ...
      return klass;
    }
    export const rbCClass = rbDefineClass("Class");

— and another module does `Object.setPrototypeOf(rbCClass.prototype,
Module.prototype)`. That read is `undefined`, so a 139-module binary compiles
and links, then aborts at startup with

    TypeError: Object.setPrototypeOf called on null or undefined

`export const X = class {}` is an ordinary way to produce a class from a
factory, so this is likely to affect other real graphs.
