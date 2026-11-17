import {
  compact,
  extractOptionsBang,
  isPresent,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import { RecordIdentifier } from "@blazetrails/actionview/record-identifier.js";
import { rbBlockGivenP, rbObjRespondTo, type Block } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../turbo-trails.js";

type Options = Record<string, unknown>;

interface FramesHelperHost {
  urlFor(options: unknown): string;
  tag(): {
    turbo_frame(options: Options, block?: Block<unknown>): SafeBuffer | Promise<SafeBuffer>;
  };
}

export const FramesHelper = {
  /** @inventedArm if — CONVERGEABLE tag-builder-trailing-undefined-block */
  turboFrameTag(this: FramesHelperHost, ...ids: unknown[]): SafeBuffer | Promise<SafeBuffer> {
    const block = rbBlockGivenP(ids.at(-1)) ? (ids.pop() as Block<unknown>) : undefined;
    const {
      src: srcOption = null,
      target = null,
      ...attributes
    } = extractOptionsBang(ids) as Options;
    let src = srcOption;
    const id =
      rbObjRespondTo(ids[0], "toKey") || typeof ids[0] === "function"
        ? RecordIdentifier.domId(ids[0], (ids[1] as string | undefined) ?? null)
        : ids.flat(Infinity).join("_");
    if (isPresent(src)) src = this.urlFor(src);

    const options = compact({ ...attributes, id, src, target });
    return block ? this.tag().turbo_frame(options, block) : this.tag().turbo_frame(options);
  },
};
Turbo.FramesHelper = FramesHelper;
