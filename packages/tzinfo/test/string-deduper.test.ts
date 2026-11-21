import { describe, expect, it } from "vitest";
import {
  ConcurrentStringDeduper,
  StringDeduper,
  UnaryMinusGlobalStringDeduper,
} from "../lib/string-deduper.js";

function dedupeTests(sd: { dedupe(string: string): string }): void {
  const s1 = String(Math.random());
  const s2 = s1;
  const s3 = s1;

  const r1 = sd.dedupe(s1);
  expect(r1).toBe(s1);

  const r2 = sd.dedupe(s2);
  expect(r2).toBe(r1);

  const r3 = sd.dedupe(s3);
  expect(r3).toBe(s3);
}

describe("TCStringDeduper", () => {
  it("string deduper dedupe", () => {
    dedupeTests(new StringDeduper());
  });

  it("concurrent string deduper dedupe", () => {
    dedupeTests(new ConcurrentStringDeduper());
  });

  it("unary minus global string deduper", () => {
    dedupeTests(new UnaryMinusGlobalStringDeduper());
  });

  it("global uses unary minus when available", () => {
    const global = StringDeduper.global;
    expect(global).toBeInstanceOf(UnaryMinusGlobalStringDeduper);
  });

  it("global returns same instance", () => {
    const global = StringDeduper.global;
    expect(StringDeduper.global).toBe(global);
  });

  it("global dedupe", () => {
    dedupeTests(StringDeduper.global);
  });
});
