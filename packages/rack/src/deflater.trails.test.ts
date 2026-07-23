import { it, expect } from "vitest";
import { Deflater } from "./deflater.js";

const app = async () => [200, {}, ["hi"]] as [number, Record<string, any>, any];

// Trails-only coverage: Ruby's `@sync = options.fetch(:sync, true)`
// (deflater.rb:43) is key-present — an explicit `sync: nil` stays nil
// (falsy, streaming sync off). The upstream suite only exercises
// `sync: false`, and the earlier `opts.sync !== false` port coerced every
// non-false value (including null) to true, so we pin the stored value here.
it("honors an explicit sync: null as falsy instead of defaulting to true", () => {
  expect((new Deflater(app, { sync: null }) as any).sync).toBeNull();
  expect((new Deflater(app, {}) as any).sync).toBe(true);
  expect((new Deflater(app, { sync: false }) as any).sync).toBe(false);
});
