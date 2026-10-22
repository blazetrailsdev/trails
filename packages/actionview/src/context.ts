import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";

import { OutputBuffer } from "./buffers.js";
import { OutputFlow } from "./flows.js";

export interface Context {
  outputBuffer: OutputBuffer | null;
  viewFlow: OutputFlow;
  _prepareContext(): void;
  _layoutFor(name?: string | null): SafeBuffer | Promise<SafeBuffer>;
}

function _prepareContext(this: Context): void {
  this.viewFlow = new OutputFlow();
  this.outputBuffer = new OutputBuffer();
  (this as unknown as { virtualPath: string | null }).virtualPath = null;
}

function _layoutFor(this: Context, name: string | null = null): SafeBuffer | Promise<SafeBuffer> {
  name ??= "layout";
  const content = this.viewFlow.get(name);
  return content instanceof Promise
    ? content.then((value) => htmlSafe(value.toString()))
    : htmlSafe(content.toString());
}

export const Context = {
  outputBuffer: null as OutputBuffer | null,
  viewFlow: null as OutputFlow | null,
  _prepareContext,
  _layoutFor,
};
