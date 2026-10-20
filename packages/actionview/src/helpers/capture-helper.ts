import { SafeBuffer, htmlEscape, isPresent, presence } from "@blazetrails/activesupport";

import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";

export interface CaptureHelperHost {
  outputBuffer: OutputBuffer | null;
  viewFlow: OutputFlow;
}

/** @inventedArm then — PERMANENT */
export function capture<TArgs extends unknown[]>(
  this: CaptureHelperHost,
  block: (...args: TArgs) => PromiseLike<unknown>,
  ...args: TArgs
): Promise<SafeBuffer | null>;
export function capture<TArgs extends unknown[]>(
  this: CaptureHelperHost,
  block: (...args: TArgs) => unknown,
  ...args: TArgs
): SafeBuffer | null;
export function capture<TArgs extends unknown[]>(
  this: CaptureHelperHost,
  block: (...args: TArgs) => unknown,
  ...args: TArgs
): SafeBuffer | null | Promise<SafeBuffer | null> {
  let value: unknown = null;
  if (!this.outputBuffer) this.outputBuffer = new OutputBuffer();
  const buf = this.outputBuffer;
  const result = (buffer: SafeBuffer): SafeBuffer | null => {
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
  };
  const buffer = buf.capture(() => (value = block(...args)));
  if (buffer instanceof Promise) {
    return buffer.then(async (buffer) => {
      value = await value;
      return result(buffer);
    });
  }
  return result(buffer);
}

/** @inventedArm if — PERMANENT */
export function contentFor(
  this: CaptureHelperHost,
  name: string,
  content: unknown = null,
  options: { flush?: boolean } = {},
  block?: () => unknown,
): SafeBuffer | null | Promise<SafeBuffer | null> {
  if (typeof content === "function" && block === undefined) {
    block = content as () => unknown;
    content = null;
  }
  if ((content != null && content !== false) || block) {
    if (block) {
      if (content != null && content !== false) options = content as { flush?: boolean };
      content = capture.call(this, block);
    }
    if (content != null && content !== false) {
      if (options.flush) {
        this.viewFlow.set(name, content);
      } else {
        this.viewFlow.append(name, content);
      }
    }
    return null;
  } else {
    const stored = this.viewFlow.get(name);
    return stored instanceof Promise ? stored.then((value) => presence(value)) : presence(stored);
  }
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

export function isContentFor(this: CaptureHelperHost, name: string): boolean | Promise<boolean> {
  const stored = this.viewFlow.get(name);
  return stored instanceof Promise
    ? stored.then((value) => isPresent(value.toString()))
    : isPresent(stored.toString());
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

export const CaptureHelper = {
  capture,
  contentFor,
  provide,
  isContentFor,
  withOutputBuffer,
};
