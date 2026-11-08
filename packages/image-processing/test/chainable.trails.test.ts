import { Tempfile } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "../lib/image-processing.js";
import { Stub, StubImage, StubProcessor } from "./support/stub-processor.js";
import { fixtureImage } from "./support/test-helper.js";
import { Builder } from "../lib/builder.js";
import { DEFAULT_OPTIONS } from "../lib/chainable.js";

const Vips = Stub;

describe("Chainable as a thenable Proxy", () => {
  it("runs the pipeline when awaited, as call() does", async () => {
    expect(await Vips.source(fixtureImage("portrait.jpg")).invert()).toBeInstanceOf(Tempfile);
  });

  it("rejects an awaited builder with no source", async () => {
    await expect(Vips.invert()).rejects.toThrow("source file is not provided");
  });

  it("queues and calls a Bang operation", async () => {
    const result = await Vips.source(fixtureImage("portrait.jpg")).shrinkBang(2, 2);
    expect(result).toBeInstanceOf(Tempfile);
    expect(StubProcessor.calls.at(-1)!.operations).toEqual([["shrink", [2, 2]]]);
  });

  it("passes save: false through to the processor's accumulator", async () => {
    const result = await Vips.invert().call(fixtureImage("portrait.jpg").path(), { save: false });
    expect((result as unknown as StubImage).operations).toEqual([["invert", []]]);
  });

  it("rejects an unknown call keyword as Ruby's call(save: true) does", async () => {
    await expect(
      Vips.source(fixtureImage("portrait.jpg")).call(null, { bogus: 1 }),
    ).rejects.toThrow("unknown keyword: :bogus");
  });

  it("never queues the names JS probes for", () => {
    const builder = Vips.invert();
    expect(builder.catch).toBeUndefined();
    expect(builder.finally).toBeUndefined();
    expect(builder.toJSON).toBeUndefined();
    expect((builder as unknown as Record<symbol, unknown>)[Symbol.toPrimitive]).toBeUndefined();
    expect(typeof builder.constructor).toBe("function");
  });
});

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    class Sub extends Builder {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub(DEFAULT_OPTIONS);
    expect(sub.secret()).toBe(1);
    const next = (sub as unknown as { invert(): Builder }).invert();
    expect(next.options.operations).toEqual([["invert", []]]);
    expect(typeof sub.then).toBe("function");
    expect(sub instanceof Builder).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
