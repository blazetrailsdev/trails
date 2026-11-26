import { runtime } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

if (runtime() === "bun") {
  const host = globalThis as { Temporal?: unknown };
  const load = (import.meta as { require?(id: string): unknown }).require ?? require!;
  host.Temporal ??= (load("@js-temporal/polyfill") as { Temporal: unknown }).Temporal;
}
