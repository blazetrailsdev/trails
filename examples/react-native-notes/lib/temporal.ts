import { Temporal } from "@js-temporal/polyfill";

const g = globalThis as { Temporal?: unknown };
g.Temporal ??= Temporal;
