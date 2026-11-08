import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { SolidCable, VERSION } from "../lib/index.js";
import { useDummyApplication, withCableConfig } from "./support/config-stubs.js";

describe("SolidCableTest", () => {
  useDummyApplication();

  it("it has a version number", () => {
    expect(VERSION).toBeTruthy();
  });

  it("autotrimming when nothing is set", async () => {
    expect(
      Object.hasOwn((await TopLevel.Trails!.application!.configFor("cable")) as object, "autotrim"),
    ).toBeFalsy();
    expect(SolidCable.isAutotrim()).toBeTruthy();
  });

  it("autotrimming when set to false", async () => {
    await withCableConfig({ autotrim: false }, async () => {
      expect(SolidCable.isAutotrim()).toBeFalsy();
    });
  });

  it("autotrimming when set to true", async () => {
    await withCableConfig({ autotrim: true }, async () => {
      expect(SolidCable.isAutotrim()).toBeTruthy();
    });
  });

  it("default trim_batch_size is 100", () => {
    expect(SolidCable.trimBatchSize()).toBe(100);
  });

  it("trim_batch_size when set badly", async () => {
    await withCableConfig({ trimBatchSize: "weird" }, async () => {
      expect(SolidCable.trimBatchSize()).toBe(100);
    });

    await withCableConfig({ trimBatchSize: "0" }, async () => {
      expect(SolidCable.trimBatchSize()).toBe(100);
    });
  });

  it("trim_batch_size when set", async () => {
    await withCableConfig({ trimBatchSize: 42 }, async () => {
      expect(SolidCable.trimBatchSize()).toBe(42);
    });
  });
});
