import { it, expect } from "vitest";
import { Deflater } from "./deflater.js";

const app = async () => [200, {}, ["hi"]] as [number, Record<string, any>, any];

it("honors an explicit sync: null as falsy instead of defaulting to true", () => {
  expect((new Deflater(app, { sync: null }) as any).sync).toBeNull();
  expect((new Deflater(app, {}) as any).sync).toBe(true);
  expect((new Deflater(app, { sync: false }) as any).sync).toBe(false);
});
