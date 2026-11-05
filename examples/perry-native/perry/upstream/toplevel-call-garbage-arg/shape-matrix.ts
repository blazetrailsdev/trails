const EXP = 8640000000000000;
const r1 = 864e5, k1 = 1e8 * r1, N1 = f1(k1), x1 = -N1;
const r2 = 864e5, k2 = 1e8 * r2, N2 = f2(k2), x2 = -N2;
const r3 = 864e5, k3 = 1e8 * r3, N3 = f1(k3);
const r4 = 864e5, k4 = 1e8 * r4;
const N4 = f1(k4);
const N5 = f1(8640000000000000);
const r6 = 864e5, k6 = 1e8 * r6, N6 = f3(k6), x6 = -N6;
function f1(t: number): number { console.log(""); return t; }
function f2(t: number): number { return t; }
function f3(t: number): number { sink(t); return t; }
function sink(_t: number): void {}
const rows: [string, number][] = [
  ["list + console.log callee + trailing -N1", N1],
  ["list + plain callee                     ", N2],
  ["list + console.log, no trailing negate  ", N3],
  ["separate stmt + console.log callee      ", N4],
  ["separate stmt + literal arg             ", N5],
  ["list + callee calling a plain fn        ", N6],
];
for (const [label, v] of rows) console.log(label, ":", v === EXP ? "OK" : "WRONG (" + v + ")");
