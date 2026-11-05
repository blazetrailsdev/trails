const o = { m(): void {} };
function probe(t: number): number { o.m(); return t; }
const a = 65536 * 65535;
const b = 65536 * 65536;
const c = 2147483647 * 1;
const d = 65535 * 65535;
const e = 46341 * 46341;
const f = 46340 * 46340;
const rows: [string, number, number][] = [
  ["65536*65535 = 4294901760 (<2^32)", probe(a), a],
  ["65536*65536 = 4294967296 (=2^32)", probe(b), b],
  ["65535*65535 = 4294836225 (<2^32)", probe(d), d],
  ["46341*46341 = 2147488281 (>2^31)", probe(e), e],
  ["46340*46340 = 2147395600 (<2^31)", probe(f), f],
  ["2147483647*1                    ", probe(c), c],
];
for (const [l, got, want] of rows) console.log(l, ":", got === want ? "OK" : "WRONG -> " + got + " want " + want);
