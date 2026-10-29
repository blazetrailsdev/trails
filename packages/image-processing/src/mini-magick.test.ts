import { block, Tempfile } from "@blazetrails/ruby-compat";
import type { CliTool } from "@blazetrails/mini-magick/tool";
import { beforeEach, describe, expect, it } from "vitest";
import { MiniMagick as ImageProcessingMiniMagick } from "./mini-magick.js";
import {
  assertDimensions,
  assertSimilar,
  copyToTempfile,
  fixtureImage,
} from "./test-helpers/test-helper.js";

type PathLike = { path(): string };
type Pipeline = { [name: string]: (...args: unknown[]) => Promise<PathLike> & Pipeline };

const MiniMagick = ImageProcessingMiniMagick as unknown as Pipeline & {
  convertShim(block?: (cmd: CliTool) => unknown): unknown;
  isValidImage(file: unknown): Promise<boolean>;
};

describe("ImageProcessing::MiniMagick", () => {
  let portrait: ReturnType<typeof fixtureImage>;

  beforeEach(() => {
    portrait = fixtureImage("portrait.jpg");
  });

  it("applies imagemagick operations", async () => {
    const actual = await MiniMagick.flip().call(portrait);
    const expected = Tempfile.new(["result", ".jpg"], null, { binmode: true });
    await MiniMagick.convertShim((cmd) => {
      cmd.append(portrait.path()!);
      cmd.flip();
      cmd.append(expected.path()!);
    });

    await assertSimilar(expected, actual);
  });

  // PERMANENT-SKIP: CLAUDE.md, "Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)" — the private `Processor#thumbnail` answers `respond_to?`, so the operation never reaches the tool.
  it.skip("applies thumbnail operation", async () => {
    const magick = (await MiniMagick.thumbnail("400x400").call(portrait, {
      save: false,
    })) as unknown as CliTool;
    expect(magick.args).toContain("-thumbnail");
  });

  it("accepts geometry", async () => {
    const pipeline = MiniMagick.source(portrait);
    await assertDimensions([300, 400], await pipeline.loader({ geometry: "400x400" }).call());
  });

  it("auto orients by default", async () => {
    let result = await MiniMagick.call(fixtureImage("rotated.jpg"));
    await assertDimensions([600, 800], result);

    result = await MiniMagick.loader({ autoOrient: false }).call(fixtureImage("rotated.jpg"));
    await assertDimensions([800, 600], result);
  });

  it("applies blocks to operations", async () => {
    const magick = (await MiniMagick.source(portrait)
      .stack(block((stack: CliTool) => stack.foo("bar")))
      .call(null, { save: false })) as unknown as CliTool;

    expect(magick.args).toEqual([portrait.path(), "-auto-orient", "(", "-foo", "bar", ")"]);
  });

  it("accepts magick object as source", async () => {
    const magick = MiniMagick.convertShim() as CliTool;
    magick.append(fixtureImage("rotated.jpg").path()!);
    const result = await MiniMagick.source(magick).call();
    await assertDimensions([600, 800], result);
  });

  describe(".valid_image?", () => {
    it("returns true for correct images", async () => {
      expect(await MiniMagick.isValidImage(portrait)).toBe(true);
      expect(await MiniMagick.isValidImage(copyToTempfile(portrait))).toBe(true);
    });

    it("returns false for invalid images", async () => {
      expect(await MiniMagick.isValidImage(fixtureImage("invalid.jpg"))).toBe(false);
      expect(await MiniMagick.isValidImage(copyToTempfile(fixtureImage("invalid.jpg")))).toBe(
        false,
      );
    });
  });

  describe("#resize_to_limit", () => {
    let pipeline: Pipeline;

    beforeEach(() => {
      pipeline = MiniMagick.source(portrait);
    });

    it("srinks image to fit the specified dimensions", async () => {
      await assertDimensions([300, 400], await pipeline.resizeToLimitBang(400, 400));
    });

    it("doesn't enlarge image if it's smaller than specified dimensions", async () => {
      await assertDimensions([600, 800], await pipeline.resizeToLimitBang(1000, 1000));
    });

    it("produces correct image", async () => {
      const expected = fixtureImage("limit.jpg");
      await assertSimilar(expected, await pipeline.resizeToLimitBang(400, 400));
    });
  });
});
