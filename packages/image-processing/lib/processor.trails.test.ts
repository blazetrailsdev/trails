import { block } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Error as ImageProcessingError } from "./image-processing.js";
import { StubImage, StubProcessor } from "./test-helpers/stub-processor.js";

const options = { loader: {}, saver: {}, operations: [] };

describe("ImageProcessing::Processor", () => {
  it("raises on a source that is neither a path nor the accumulator class", async () => {
    await expect(StubProcessor.call({ ...options, source: 42 })).rejects.toThrow(
      new ImageProcessingError("invalid source: 42"),
    );
  });

  it("sends each operation to the accumulator, then returns it without a destination", async () => {
    const result = await StubProcessor.call({
      ...options,
      source: "image.jpg",
      operations: [
        ["invert", []],
        ["shrink", [2, 2]],
      ],
    });
    expect(result).toEqual(
      new StubImage("image.jpg", [
        ["invert", []],
        ["shrink", [2, 2]],
      ]),
    );
  });

  it("saves the accumulator to the destination", async () => {
    await StubProcessor.call({
      ...options,
      source: new StubImage("image.jpg"),
      operations: [["invert", []]],
      destination: "out.jpg",
    });
    expect(StubProcessor.calls.at(-1)).toEqual({
      operations: [["invert", []]],
      destination: "out.jpg",
    });
  });

  it("defines the accumulator reader and ACCUMULATOR_CLASS", () => {
    const image = new StubImage("image.jpg");
    expect((new StubProcessor(image) as unknown as { image: StubImage }).image).toBe(image);
    expect(StubProcessor.ACCUMULATOR_CLASS).toBe(StubImage);
  });

  it("calls a processor macro before the accumulator's method", () => {
    const image = new StubImage("image.jpg");
    const inverted = new StubProcessor(image).applyOperation(
      "custom",
      block((accumulator: StubImage) => accumulator.invert()),
    );
    expect(inverted).toEqual(new StubImage("image.jpg", [["invert", []]]));
  });

  it("custom answers the accumulator when the block answers nil or is absent", () => {
    const image = new StubImage("image.jpg");
    expect(new StubProcessor(image).custom(() => null)).toBe(image);
    expect(new StubProcessor(image).custom()).toBe(image);
  });
});
