import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { Fiber } from "@blazetrails/ruby-compat";

import { OutputBuffer } from "./buffers.js";

export class OutputFlow {
  content: Map<string, SafeBuffer> = new Map();

  get(key: string): SafeBuffer | Promise<SafeBuffer> {
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
    const current = this.content.get(key) ?? htmlSafe("");
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

interface StreamingFlowView {
  outputBuffer: OutputBuffer | null;
  viewFlow: OutputFlow;
}

export class StreamingFlow extends OutputFlow {
  private _view: StreamingFlowView;
  private _parent: OutputBuffer | null;
  private _child: OutputBuffer | null;
  private _fiber: Fiber;
  private _root: Fiber;
  private _waitingFor: string | null = null;

  constructor(view: StreamingFlowView, fiber: Fiber) {
    super();
    this._view = view;
    this._parent = null;
    this._child = view.outputBuffer;
    this.content = view.viewFlow.content;
    this._fiber = fiber;
    this._root = Fiber.current();
  }

  override get(key: string): SafeBuffer | Promise<SafeBuffer> {
    if (this.content.has(key)) return super.get(key);

    if (this.isInsideFiber()) {
      const view = this._view;

      this._waitingFor = key;
      [view.outputBuffer, this._parent] = [this._child, view.outputBuffer];
      return Fiber.yield()
        .finally(() => {
          this._waitingFor = null;
          [view.outputBuffer, this._child] = [this._parent, view.outputBuffer];
        })
        .then(() => super.get(key));
    }

    return super.get(key);
  }

  override appendBang(key: string, value: unknown): void {
    super.appendBang(key, value);
    if (this._waitingFor === key) void this._fiber.resume();
  }

  private isInsideFiber(): boolean {
    return Fiber.current() !== this._root;
  }
}

function toS(value: unknown): string {
  if (value == null) return "";
  if (value instanceof SafeBuffer) return value.toString();
  if (value instanceof OutputBuffer) return value.toStr();
  return String(value);
}
