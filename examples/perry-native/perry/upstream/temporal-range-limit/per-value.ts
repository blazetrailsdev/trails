import { Temporal } from "@js-temporal/polyfill";
for (const v of [0n, 1n, -1n, 1000000000n, 1793829332000000000n]) {
  try {
    const i = Temporal.Instant.fromEpochNanoseconds(v);
    console.log(String(v).padStart(20), "-> OK  ", i.toString());
  } catch (e) {
    console.log(String(v).padStart(20), "-> THROW", (e as Error).message);
  }
}
