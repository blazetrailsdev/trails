import { block, NoMethodError, Tempfile } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Error as ImageProcessingError } from "./image-processing.js";
import { Stub } from "./test-helpers/stub-processor.js";
import { fixtureImage } from "./test-helpers/test-helper.js";

const Vips = Stub;

describe("ImageProcessing::Pipeline", () => {
  let portrait: ReturnType<typeof fixtureImage>;

  beforeEach(() => {
    portrait = fixtureImage("portrait.jpg");
  });

  it("accepts source", () => {
    const pipeline = Vips.source(portrait);
    expect(pipeline.options.source).toBe(portrait);
  });

  it("accepts loader options", () => {
    let pipeline = Vips.loader({ shrink: 2 });
    expect(pipeline.options.loader).toEqual({ shrink: 2 });

    pipeline = pipeline.loader({ autorotate: true });
    expect(pipeline.options.loader).toEqual({ shrink: 2, autorotate: true });
  });

  it("accepts saver options", () => {
    let pipeline = Vips.saver({ strip: true });
    expect(pipeline.options.saver).toEqual({ strip: true });

    pipeline = pipeline.saver({ Q: 100 });
    expect(pipeline.options.saver).toEqual({ strip: true, Q: 100 });
  });

  it("accepts operations", () => {
    let pipeline = Vips.shrink(2, 2);
    expect(pipeline.options.operations).toEqual([["shrink", [2, 2]]]);

    pipeline = pipeline.invert();
    expect(pipeline.options.operations).toEqual([
      ["shrink", [2, 2]],
      ["invert", []],
    ]);
  });

  it("saves blocks passed to operations", () => {
    const pipeline = Vips.stack(block((stack: { foo(arg: string): unknown }) => stack.foo("bar")));
    expect(pipeline.options.operations[0][0]).toBe("stack");
    expect(pipeline.options.operations[0][1]).toEqual([]);
    expect(pipeline.options.operations[0][2]).toBeInstanceOf(Function);
  });

  it("merges different options", () => {
    const pipeline = Vips.resizeToFill(400, 400).convert("png");

    expect(pipeline.options.operations).toEqual([["resizeToFill", [400, 400]]]);
    expect(pipeline.options.format).toBe("png");
  });

  it("doesn't mutate the receiver when branching", () => {
    const pipelineJpg = Vips.convert("jpg");
    const pipelinePng = pipelineJpg.convert("png");

    expect(pipelineJpg.options.format).toBe("jpg");
    expect(pipelinePng.options.format).toBe("png");
  });

  it("executes processing on #call without source", async () => {
    const result = await Vips.source(portrait).convert("png").call();
    expect(result).toBeInstanceOf(Tempfile);
  });

  it("raises exception when source was not provided", async () => {
    await expect(Vips.call()).rejects.toThrow(ImageProcessingError);
  });

  it("raises a NoMethodError when predicate method is not defined", () => {
    expect(() => Vips.isValid(portrait)).toThrow(NoMethodError);
  });
});
