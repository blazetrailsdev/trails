// Minimal repro candidate for the setQuery mask: does a leaf method survive
// a deep Error chain whose base mutates `prototype.name`?
class A extends Error {}
A.prototype.name = "A";
class B extends A {}
class C extends B {}
class D extends C {}
class E extends D {
  marker(): string {
    return "ok";
  }
}

const e = new E("boom");
console.log("[e1] instanceof E     =", e instanceof E);
console.log("[e2] instanceof Error =", e instanceof Error);
console.log("[e3] typeof marker    =", typeof e.marker);
console.log("[e4] message          =", e.message);
console.log("[e5] name             =", e.name);
console.log("[e6] proto has marker =", "marker" in Object.getPrototypeOf(e));
console.log("[e7] call it          =", typeof e.marker === "function" ? e.marker() : "MISSING");

// control: same depth, no prototype.name mutation
class P extends Error {}
class Q extends P {}
class R extends Q {}
class S extends R {
  marker(): string {
    return "ok";
  }
}
const s = new S("boom");
console.log("[e8] no-mutation typeof marker =", typeof s.marker);

// control: shallow chain with the mutation
class T extends Error {}
T.prototype.name = "T";
class U extends T {
  marker(): string {
    return "ok";
  }
}
console.log("[e9] shallow+mutation typeof marker =", typeof new U("x").marker);
