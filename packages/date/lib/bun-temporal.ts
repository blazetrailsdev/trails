import { runtime } from "@blazetrails/ruby-compat";

declare const require: (id: string) => { Temporal: unknown };

if (runtime() === "bun") {
  const host = globalThis as { Temporal?: unknown };
  host.Temporal ??= require("@js-temporal/polyfill").Temporal;
}
