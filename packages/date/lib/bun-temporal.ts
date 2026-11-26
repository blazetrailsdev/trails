import { runtime } from "@blazetrails/ruby-compat";

if (runtime() === "bun") {
  const host = globalThis as { Temporal?: unknown };
  host.Temporal ??= (import.meta as { require?(id: string): { Temporal: unknown } }).require!(
    "@js-temporal/polyfill",
  ).Temporal;
}
