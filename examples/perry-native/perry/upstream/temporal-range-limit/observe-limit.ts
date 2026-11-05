import JSBI from "../../../node_modules/.pnpm/jsbi@4.3.2/node_modules/jsbi/dist/jsbi.mjs";
const J = JSBI as any;
const log: string[] = [];
const realGT = J.greaterThan.bind(J);
const realLT = J.lessThan.bind(J);
J.greaterThan = function (a: any, b: any) { const r = realGT(a, b); log.push("GT|" + s(a) + "|" + s(b) + "|" + r); return r; };
J.lessThan = function (a: any, b: any) { const r = realLT(a, b); log.push("LT|" + s(a) + "|" + s(b) + "|" + r); return r; };
function s(x: any): string { try { return x == null ? String(x) : x.toString(); } catch { return "<?>"; } }
const { Temporal } = await import("@js-temporal/polyfill");
let outcome = "";
try { Temporal.Instant.fromEpochNanoseconds(1793829332000000000n); outcome = "OK"; }
catch (e) { outcome = "throw: " + (e as Error).message; }
console.log("outcome:", outcome);
console.log("expected limit: 8640000000000000000000");
for (const line of log.slice(0, 4)) console.log("  ", line);
console.log("(wrappers contain NO console call; values captured then printed)");
