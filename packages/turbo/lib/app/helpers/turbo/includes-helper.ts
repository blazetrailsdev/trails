import type { SafeBuffer } from "@blazetrails/activesupport";
import { Turbo } from "../../../turbo-trails.js";

interface IncludesHelperHost {
  javascriptIncludeTag(...sources: unknown[]): SafeBuffer;
}

export const IncludesHelper = {
  turboIncludeTags(this: IncludesHelperHost): SafeBuffer {
    return this.javascriptIncludeTag("turbo", { type: "module" });
  },
};
Turbo.IncludesHelper = IncludesHelper;
