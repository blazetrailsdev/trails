import { Tempfile } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "./image-processing.js";
import { Stub, StubProcessor } from "./test-helpers/stub-processor.js";
import { fixtureImage } from "./test-helpers/test-helper.js";

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
    expect(result.operations).toEqual([["invert", []]]);
  });

  it("never queues the names JS probes for", () => {
    const builder = Vips.invert();
    expect(builder.catch).toBeUndefined();
    expect(builder.finally).toBeUndefined();
    expect(builder.toJSON).toBeUndefined();
    expect(builder[Symbol.toPrimitive]).toBeUndefined();
    expect(typeof builder.constructor).toBe("function");
  });
});
