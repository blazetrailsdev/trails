class Mine extends Array<number> {
  toString(): string { return "OVERRIDE"; }
}
const a = new Mine();
a.push(1, 2, 3);
const f = (a as any).toString;
console.log("fused   a.toString():", (a as any).toString());
console.log("parens (a.toString)():", ((a as any).toString)());
console.log("extracted f.call(a) :", f.call(a));
console.log("Reflect.get then call:", (Reflect.get(a, "toString") as () => string).call(a));
console.log("String(a)           :", String(a));
console.log("`${a}`              :", `${a}`);
console.log("a + ''              :", (a as any) + "");
