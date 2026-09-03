import { SafeBuffer, htmlEscape, isPresent } from "@blazetrails/activesupport";

import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";

export interface CaptureHelperHost {
  outputBuffer: OutputBuffer | null;
  viewFlow: OutputFlow;
}

export function capture<TArgs extends unknown[]>(
  this: CaptureHelperHost,
  block: (...args: TArgs) => unknown,
  ...args: TArgs
): SafeBuffer | null {
  let value: unknown = null;
  if (!this.outputBuffer) this.outputBuffer = new OutputBuffer();
  const buf = this.outputBuffer;
  const buffer = buf.capture([], () => {
    value = block(...args);
  });

  let string: unknown;
  if (buf === value) {
    string = buffer;
  } else {
    string = isPresent(buffer.toString()) ? buffer : value;
  }

  if (string instanceof OutputBuffer) return string.toString();
  if (string instanceof SafeBuffer) return string;
  if (typeof string === "string") return htmlEscape(string);
  return null;
}

export function contentFor(
  this: CaptureHelperHost,
  name: string,
  content?: unknown,
  options?: { flush?: boolean },
  block?: () => unknown,
): SafeBuffer | null {
  if (typeof content === "function" && block === undefined) {
    block = content as () => unknown;
    content = undefined;
  }
  if (content != null || block) {
    let opts = options;
    let body: unknown = content;
    if (block) {
      if (options === undefined && isPlainOptions(content)) {
        opts = content;
      }
      body = capture.call(this, block);
    }
    if (body !== undefined && body !== null) {
      if (opts?.flush) {
        this.viewFlow.set(name, body);
      } else {
        this.viewFlow.append(name, body);
      }
    }
    return null;
  }
  const stored = this.viewFlow.get(name);
  return isPresent(stored.toString()) ? stored : null;
}

function isPlainOptions(value: unknown): value is { flush?: boolean } {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

export function provide(
  this: CaptureHelperHost,
  name: string,
  content?: unknown,
  block?: () => unknown,
): SafeBuffer | null {
  let body: unknown = content;
  if (block) body = capture.call(this, block);
  if (body !== undefined && body !== null) {
    this.viewFlow.appendBang(name, body);
    return null;
  }
  return null;
}

export function contentForQuestion(this: CaptureHelperHost, name: string): boolean {
  return isPresent(this.viewFlow.get(name).toString());
}

/** @internal */
export function withOutputBuffer(
  this: CaptureHelperHost,
  buf: OutputBuffer | null,
  block: () => void,
): OutputBuffer {
  const next = buf ?? new OutputBuffer();
  const old = this.outputBuffer;
  this.outputBuffer = next;
  try {
    block();
    return next;
  } finally {
    this.outputBuffer = old;
  }
}
