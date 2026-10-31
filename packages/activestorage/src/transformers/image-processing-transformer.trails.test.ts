import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActiveStorage } from "../active-storage.js";
import {
  ImageProcessingTransformer,
  UnsupportedImageProcessingArgument,
  UnsupportedImageProcessingMethod,
} from "./image-processing-transformer.js";
import { Transformer } from "./transformer.js";

const FIXTURE = new URL("../test-helpers/fixtures/files/racecar.jpg", import.meta.url).pathname;

describe("ActiveStorage::Transformers::ImageProcessingTransformer", () => {
  beforeEach(() => {
    ActiveStorage.unsupportedImageProcessingArguments = ["-debug", "-write", "-set"];
  });
  afterEach(() => {
    ActiveStorage.variantProcessor = "mini_magick";
  });

  const transform = (transformations: Record<string, unknown>) =>
    new ImageProcessingTransformer(transformations).transform(
      FIXTURE,
      { format: "png" },
      (output) => output.size(),
    );

  it("raises NotImplementedError from the abstract process", async () => {
    await expect(
      new Transformer({}).transform(FIXTURE, { format: "png" }, () => 1),
    ).rejects.toThrow("NotImplementedError");
  });

  it.each([
    ["string", { resize: "-write /tmp/x" }],
    ["array", { resize: [100, "-set"] }],
    ["nested array", { resize: [[1, ["-debug"]]] }],
    ["hash", { saver: { "-write": 1 } }],
    ["nested hash", { saver: { a: { b: "-DEBUG" } } }],
  ])("raises UnsupportedImageProcessingArgument for a %s", async (_kind, transformations) => {
    await expect(transform(transformations)).rejects.toThrow(UnsupportedImageProcessingArgument);
  });

  it("raises UnsupportedImageProcessingMethod for an unlisted method", async () => {
    await expect(transform({ systemCall: "x" })).rejects.toThrow(UnsupportedImageProcessingMethod);
  });

  it("refuses combine_options", async () => {
    ActiveStorage.supportedImageProcessingMethods.push("combine_options");
    await expect(transform({ combineOptions: { a: 1 } })).rejects.toThrow(
      "doesn't support :combine_options",
    );
    ActiveStorage.supportedImageProcessingMethods.pop();
  });

  it("does not validate under vips", async () => {
    ActiveStorage.variantProcessor = "vips";
    await expect(transform({ resizeToLimit: [10, 10] })).resolves.toBeGreaterThan(0);
  });

  it("produces a png with mini_magick, dropping a blank argument", async () => {
    await expect(
      transform({ resizeToLimit: [10, 10], monochrome: false }),
    ).resolves.toBeGreaterThan(0);
  });

  it("reaches the tempfile path and closes it after the block", async () => {
    const t = new ImageProcessingTransformer({ resizeToLimit: [10, 10] });
    const output = await t.transform(FIXTURE, { format: "png" }, (o) => o);
    expect(output.path()).toBeNull();
  });
});
