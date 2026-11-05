const o = { m(): void {} };
function probe(t: number): number {
  o.m();
  return t;
}
const lit = 4294967296;
const mul = 65536 * 65536;
const add = 2147483647 + 1;
const sub = -2147483648 - 1;
const bitor = 4294967296 | 0;
const viaf = 4294967296.5 - 0.5;
const rows: [string, number, number][] = [
  ["literal 4294967296      ", probe(lit), lit],
  ["mul 65536*65536         ", probe(mul), mul],
  ["add 2147483647+1        ", probe(add), add],
  ["sub -2147483648-1       ", probe(sub), sub],
  ["bitor (ToInt32 -> 0)    ", probe(bitor), bitor],
  ["float 4294967296.5-0.5  ", probe(viaf), viaf],
];
for (const [l, got, want] of rows)
  console.log(l, ":", got === want ? "OK" : "WRONG -> " + got + " want " + want);
