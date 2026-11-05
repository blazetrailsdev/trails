import { Temporal } from "@js-temporal/polyfill";
function ok(v: bigint): boolean {
  try { Temporal.Instant.fromEpochNanoseconds(v); return true; }
  catch (e) { return !/outside of supported range/.test((e as Error).message); }
}
let lo = 0n, hi = 8640000000000000000000n;
if (!ok(lo)) { console.log("even 0 is out of range"); } else {
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (ok(mid)) lo = mid; else hi = mid;
  }
  console.log("highest accepted :", lo.toString());
  console.log("expected limit   : 8640000000000000000000");
  console.log("ratio            :", Number(8640000000000000000000n / (lo + 1n)));
}
