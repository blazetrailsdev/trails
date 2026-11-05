import JSBI from "../../../node_modules/.pnpm/jsbi@4.3.2/node_modules/jsbi/dist/jsbi.mjs";
import { Temporal } from "@js-temporal/polyfill";
const J = JSBI as any;
const Ne = J.multiply(J.BigInt(1e8 * 864e5), J.BigInt(1e6));
const xe = J.unaryMinus(Ne);
console.log("Ne =", Ne.toString());
function replFr(v: bigint): boolean {
  const t = J.BigInt(v.toString(10));
  return !(J.lessThan(t, xe) || J.greaterThan(t, Ne));
}
function viaPolyfill(v: bigint): boolean {
  try { Temporal.Instant.fromEpochNanoseconds(v); return true; }
  catch (e) { return !/outside of supported range/.test((e as Error).message); }
}
for (const v of [10n ** 12n, 10n ** 15n, 10n ** 16n, 10n ** 18n, 1793829332000000000n, 10n ** 21n]) {
  console.log(String(v).padStart(23), "replicated:", replFr(v) ? "IN " : "OUT", " polyfill:", viaPolyfill(v) ? "IN" : "OUT");
}
