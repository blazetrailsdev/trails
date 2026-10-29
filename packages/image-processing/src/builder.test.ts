import { Tempfile } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import "./image-processing.js";
import { Stub } from "./test-helpers/stub-processor.js";
import { fixtureImage } from "./test-helpers/test-helper.js";

describe("ImageProcessing::Builder", () => {
  let portrait: ReturnType<typeof fixtureImage>;

  beforeEach(() => {
    portrait = fixtureImage("portrait.jpg");
  });

  it("instruments pipeline execution", async () => {
    let pipeline = Stub.source(portrait)
      .loader({ shrink: 2 })
      .resizeToLimit(500, 500)
      .saver({ strip: true })
      .convert("png");

    let instrumenterCalled = false;

    pipeline = pipeline.instrumenter((options: Record<string, unknown>, block: () => unknown) => {
      instrumenterCalled = true;

      expect(options.source).toBe(portrait);
      expect(options.loader).toEqual({ shrink: 2 });
      expect(options.operations).toEqual([["resizeToLimit", [500, 500]]]);
      expect(options.saver).toEqual({ strip: true });
      expect(options.format).toBe("png");

      return block();
    });

    await pipeline.call();

    expect(instrumenterCalled).toBe(true);
  });

  it("handles instrumenter not returning pipeline result", async () => {
    const pipeline = Stub.source(portrait).instrumenter(
      (_options: unknown, block: () => unknown) => block() && "foo",
    );

    expect(await pipeline.call()).toBeInstanceOf(Tempfile);
  });
});
