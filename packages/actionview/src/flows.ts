import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";

import { OutputBuffer } from "./buffers.js";

export class OutputFlow {
  readonly content: Map<string, SafeBuffer> = new Map();

  get(key: string): SafeBuffer {
    let buf = this.content.get(key);
    if (!buf) {
      buf = htmlSafe("");
      this.content.set(key, buf);
    }
    return buf;
  }

  set(key: string, value: unknown): void {
    this.content.set(key, htmlSafe(toS(value)));
  }

  append(key: string, value: unknown): void {
    if (value == null) return;
    const current = this.get(key);
    let piece: string | SafeBuffer;
    if (value instanceof SafeBuffer) piece = value;
    else if (value instanceof OutputBuffer) piece = value.toString();
    else piece = toS(value);
    this.content.set(key, current.concat(piece));
  }

  appendBang(key: string, value: unknown): void {
    this.append(key, value);
  }
}

function toS(value: unknown): string {
  if (value == null) return "";
  if (value instanceof SafeBuffer) return value.toString();
  if (value instanceof OutputBuffer) return value.toStr();
  return String(value);
}
