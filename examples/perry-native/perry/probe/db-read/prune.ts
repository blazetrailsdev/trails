// Is a class method pruned when it is only reachable through a
// dynamically-typed receiver (catch + instanceof), as setQuery is?
export class Thing {
  calledStatically(): string {
    return "static";
  }
  onlyViaUnknown(): string {
    return "dynamic";
  }
  neverCalled(): string {
    return "never";
  }
}

const t = new Thing();
console.log("[p1] statically-called present =", typeof t.calledStatically);
console.log("[p2] called via unknown present=", typeof t.onlyViaUnknown);
console.log("[p3] never-called present      =", typeof t.neverCalled);
console.log("[p4] prototype names =", JSON.stringify(Object.getOwnPropertyNames(Thing.prototype)));

// a real static call, so this one is definitely reachable
console.log("[p5] static call =", t.calledStatically());

// the setQuery pattern: only reachable after narrowing an `unknown`
try {
  throw new Thing();
} catch (ex) {
  if (ex instanceof Thing) {
    console.log(
      "[p6] via narrowed unknown =",
      typeof ex.onlyViaUnknown === "function" ? ex.onlyViaUnknown() : "MISSING",
    );
  }
}
