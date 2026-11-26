import { runtime } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

if (runtime() === "bun") {
  const host = globalThis as { Temporal?: unknown };
  host.Temporal ??= (require!("@js-temporal/polyfill") as { Temporal: unknown }).Temporal;
}
