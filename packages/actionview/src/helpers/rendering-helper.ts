import type { SafeBuffer } from "@blazetrails/activesupport";
import { Module, isSymbol } from "@blazetrails/ruby-compat";

import { capture, type CaptureHelperHost } from "./capture-helper.js";

export function _layoutFor(
  this: CaptureHelperHost,
  ...args: (string | null | undefined | ((...args: unknown[]) => unknown))[]
): SafeBuffer | null | Promise<SafeBuffer> {
  const block =
    typeof args[args.length - 1] === "function"
      ? (args.pop() as (...args: unknown[]) => unknown)
      : undefined;
  const name = args[0] as string | null | undefined;

  if (block && !isSymbol(name)) {
    return capture.call(this, block, ...args);
  } else {
    return RenderingHelper.superMethod(this, "_layoutFor")!(...args) as
      | SafeBuffer
      | Promise<SafeBuffer>;
  }
}

export const RenderingHelper = new Module((mod) => {
  mod.moduleEval((m) => {
    Object.assign(m, { _layoutFor });
  });
});
