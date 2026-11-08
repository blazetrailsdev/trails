import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "../lib/loader.js";
import { get, newLoader, teardown, withFiles } from "./support/loader-test.js";

describe("TestOnSetup", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("on_setup callbacks are fired on setup, in order", async () => {
    const x: number[] = [];
    await loader.onSetup(() => x.push(0));
    await loader.onSetup(() => x.push(1));
    await loader.setup();
    expect(x).toEqual([0, 1]);
  });

  it("on_setup callbacks are fired if setup was already done", async () => {
    await loader.setup();
    const x: number[] = [];
    await loader.onSetup(() => x.push(0));
    await loader.onSetup(() => x.push(1));
    expect(x).toEqual([0, 1]);
  });

  it("on_setup callbacks are fired again on reload", async () => {
    const x: number[] = [];
    await loader.onSetup(() => x.push(0));
    await loader.onSetup(() => x.push(1));
    await loader.setup();
    expect(x).toEqual([0, 1]);
    await loader.reload();
    expect(x).toEqual([0, 1, 0, 1]);
  });

  it("on_setup is able to autoload", async () => {
    await withFiles([["x.ts", "export const X = true"]], async () => {
      await loader.pushDir(".");
      await loader.onSetup(async () => expect(await get(Object, "X")).toBeTruthy());
      await loader.setup();
    });
  });
});
