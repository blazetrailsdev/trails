// Is `in` broken generally, or only for native-handle objects?
const plain: Record<string, unknown> = {};
const k = ["probe", "Field"].join("");
plain[k] = 42;
console.log("[p1] plain keys =", JSON.stringify(Object.keys(plain)));
console.log("[p2] plain in   =", k in plain);
console.log("[p3] plain read =", String(plain[k]));

const lit: Record<string, unknown> = { probeField: 42 };
console.log("[p4] literal in =", "probeField" in lit);

class C {
  declare x?: number;
}
const c = new C() as unknown as Record<string, unknown>;
c[k] = 7;
console.log("[p5] class keys =", JSON.stringify(Object.keys(c)));
console.log("[p6] class in   =", k in c);
