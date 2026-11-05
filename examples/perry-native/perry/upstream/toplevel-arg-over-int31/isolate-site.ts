const o = { m(): void {} };
const v = 65536 * 65536;
console.log("v printed directly     :", v);
console.log("v again                :", v);
console.log("probe(v)               :", probe(v));
console.log("probe(65536*65536) lit :", probe(65536 * 65536));
const w = v;
console.log("copy of v              :", w);
console.log("probe(w)               :", probe(w));
console.log("v + 0                  :", v + 0);
console.log("want                   : 4294967296");
function probe(t: number): number { o.m(); return t; }
