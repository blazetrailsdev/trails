import type { SafeBuffer } from "@blazetrails/activesupport";
import { isSymbol } from "@blazetrails/ruby-compat";

import { Context } from "../context.js";
import { capture, type CaptureHelperHost } from "./capture-helper.js";

export function _layoutFor(this: CaptureHelperHost, ...args: unknown[]): SafeBuffer | null {
  const block =
    typeof args[args.length - 1] === "function"
      ? (args.pop() as (...args: unknown[]) => unknown)
      : undefined;
  const name = args[0];

  if (block && !isSymbol(name)) {
    return capture.call(this, block, ...args);
  } else {
    return Context.prototype._layoutFor.call(this as Context, name as string | null | undefined);
  }
}
