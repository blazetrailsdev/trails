import JSBI from "../../../node_modules/.pnpm/jsbi@4.3.2/node_modules/jsbi/dist/jsbi.mjs";
const J = JSBI as any;
const obj = { m(_x: number): number { return 0; } };
function freeFn(_x: number): number { return 0; }

const r1 = 864e5, k1 = 1e8 * r1, N1 = leak777(k1);
const r2 = 864e5, k2 = 1e8 * r2, N2 = localObj(k2);
const r3 = 864e5, k3 = 1e8 * r3, N3 = freeCall(k3);
const r4 = 864e5, k4 = 1e8 * r4, N4 = importedNoArg(k4);
const r5 = 864e5, k5 = 1e8 * r5, N5 = importedTwoArgs(k5);

function leak777(t: number): number { J.BigInt(777); return t; }
function localObj(t: number): number { obj.m(777); return t; }
function freeCall(t: number): number { freeFn(777); return t; }
function importedNoArg(t: number): number { J.BigInt(0); return t; }
function importedTwoArgs(t: number): number { J.multiply(J.BigInt(5), J.BigInt(9)); return t; }

const EXP = 8640000000000000;
const rows: [string, number][] = [
  ["imported method, inner arg 777", N1],
  ["local object method, arg 777  ", N2],
  ["free function, arg 777        ", N3],
  ["imported method, inner arg 0  ", N4],
  ["imported, nested two-arg      ", N5],
];
for (const [l, v] of rows) console.log(l, ":", v === EXP ? "OK" : "WRONG -> " + v);
