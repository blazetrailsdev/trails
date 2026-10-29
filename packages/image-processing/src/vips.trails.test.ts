import { File } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Vips } from "./vips.js";

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
