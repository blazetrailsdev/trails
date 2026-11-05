const o = { m(): void {} };
const v = 65536 * 65536;
console.log("v           :", v);
console.log("probe(v)    :", probe(v));
console.log("want        : 4294967296");
function probe(t: number): number {
  o.m();
  return t;
}
