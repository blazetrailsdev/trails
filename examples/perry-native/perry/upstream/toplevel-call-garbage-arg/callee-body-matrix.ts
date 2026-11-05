const EXP = 8640000000000000;
const a = 864e5, k = 1e8 * a;
const A = cLog(k), B = cErr(k), C = mathMax(k), D = strOf(k), E = isInt(k), F = jsonStr(k), G = dateNow(k);
function cLog(t: number): number { console.log(""); return t; }
function cErr(t: number): number { console.error(""); return t; }
function mathMax(t: number): number { Math.max(1, 2); return t; }
function strOf(t: number): number { String(99); return t; }
function isInt(t: number): number { Number.isInteger(1); return t; }
function jsonStr(t: number): number { JSON.stringify(1); return t; }
function dateNow(t: number): number { Date.now(); return t; }
const rows: [string, number][] = [
  ["console.log    ", A], ["console.error  ", B], ["Math.max       ", C],
  ["String()       ", D], ["Number.isInteger", E], ["JSON.stringify ", F], ["Date.now       ", G],
];
for (const [l, v] of rows) console.log(l, ":", v === EXP ? "OK" : "WRONG (" + v + ")");
