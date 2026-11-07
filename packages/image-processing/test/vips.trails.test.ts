import { File } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { fixtureImage } from "./support/test-helper.js";
import { Vips, vips } from "../lib/vips.js";

type Utils = { selectValidOptions(operationName: string, options: object): object };
const { Utils } = (Vips as unknown as { Processor: { Utils: Utils } }).Processor;

describe("ImageProcessing::Vips::Processor::Utils", () => {
  it("keeps every optional input wasm-vips declares for each filename loader and saver", () => {
    const declarations = File.read(
      File.join(import.meta.dirname, "../node_modules/wasm-vips/lib/vips.d.ts"),
    );
    const operations = [
      ...declarations.matchAll(
        /(\w+(?:load|save))\((?:filename|\w+): string, options\?: \{([\s\S]*?)\n\s{8}\}\)/g,
      ),
    ];
    expect(operations.length).toBeGreaterThan(20);

    for (const [, operation, body] of operations) {
      const options = Object.fromEntries(
        [...body.matchAll(/^\s+(\w+)\?:/gm)].map(([, name]) => [name, true]),
      );
      expect(Utils.selectValidOptions(operation, options), operation).toEqual(options);
    }
  });
});

type Pipeline = { [name: string]: (...args: unknown[]) => Pipeline & Promise<unknown> };

describe("ImageProcessing::Vips wasm-vips handle lifetime", () => {
  const load = (name: string) => vips.Image.newFromFile(fixtureImage(name).path()!);

  it("does not delete a caller-supplied source in resizeAndPad", async () => {
    const source = load("portrait.jpg");
    await (Vips as unknown as Pipeline).resizeAndPad(400, 400, { alpha: true }).call(source);
    expect(source.isDeleted()).toBe(false);
    expect(source.width).toBeGreaterThan(0);
  });

  it("does not delete a caller-supplied source in resizeToCover", async () => {
    const source = load("portrait.jpg");
    await (Vips as unknown as Pipeline).resizeToCover(300, 200).call(source);
    expect(source.isDeleted()).toBe(false);
    expect(source.width).toBeGreaterThan(0);
  });

  it("does not delete a caller-supplied overlay in composite", async () => {
    const source = load("portrait.jpg");
    const overlay = load("landscape.jpg");
    await (Vips as unknown as Pipeline).composite(overlay, { offset: [10, 10] }).call(source);
    await (Vips as unknown as Pipeline).composite([overlay], "over").call(source);
    expect(source.isDeleted()).toBe(false);
    expect(overlay.isDeleted()).toBe(false);
    expect(overlay.width).toBeGreaterThan(0);
  });
});
