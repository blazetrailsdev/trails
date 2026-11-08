import { isStruct } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { corpus } from "./fixtures/corpus.js";
import * as Mail from "../index.js";

const norm = (v: unknown): unknown => {
  if (isStruct(v)) {
    return Object.fromEntries(v.members().map((m) => [m, norm((v as Record<string, unknown>)[m])]));
  }
  if (Array.isArray(v)) return v.map(norm);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
  }
  return v;
};

type Row = {
  parser: string;
  input: string | null;
  struct?: unknown;
  error?: string;
  message?: string;
};
const rows = corpus as Row[];
const parserFor = (row: Row) =>
  (Mail as unknown as Record<string, { parse(d: string | null): unknown }>)[row.parser];

describe("Mail::Parsers against the Ruby parsers", () => {
  for (const row of rows.filter((r) => r.error === undefined)) {
    it(`${row.parser} ${JSON.stringify(row.input)}`, () => {
      expect(norm(parserFor(row).parse(row.input))).toEqual(row.struct);
    });
  }

  for (const row of rows.filter((r) => r.error !== undefined)) {
    it(`${row.parser} ${JSON.stringify(row.input)} raises`, () => {
      expect(() => parserFor(row).parse(row.input)).toThrow(row.message);
      expect(() => parserFor(row).parse(row.input)).toThrow(
        expect.objectContaining({ constructor: expect.objectContaining({ name: row.error }) }),
      );
    });
  }
});
