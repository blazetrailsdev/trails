import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";

import { OutputBuffer } from "./buffers.js";
import { OutputFlow } from "./flows.js";

export class Context {
  outputBuffer!: OutputBuffer | null;

  viewFlow!: OutputFlow;

  _prepareContext(): void {
    this.viewFlow = new OutputFlow();
    this.outputBuffer = new OutputBuffer();
    (this as unknown as { virtualPath: string | null }).virtualPath = null;
  }

  _layoutFor(name: string | null = null): SafeBuffer {
    name ??= "layout";
    return htmlSafe(this.viewFlow.get(name).toString());
  }
}
