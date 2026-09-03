import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { OutputBuffer } from "./buffers.js";
import type { TemplateLocals, TemplateRegistry } from "./template-registry.js";

export type RenderOptions<P extends string, A extends string = DeriveLocalName<P>> =
  | RenderSingleOptions<P>
  | RenderCollectionOptions<P, A>;

type RenderSingleOptions<P extends string> = {
  partial: P;
  collection?: undefined;
  as?: string;
  spacerTemplate?: undefined;
} & (P extends keyof TemplateRegistry
  ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} extends TemplateLocals<TemplateRegistry[P]>
    ? { locals?: TemplateLocals<TemplateRegistry[P]> }
    : { locals: TemplateLocals<TemplateRegistry[P]> }
  : { locals?: Record<string, unknown> });

type LastSegment<P extends string> = P extends `${string}/${infer L}` ? L : P;
type StripLeadingUnderscore<S extends string> = S extends `_${infer R}` ? R : S;
type BeforeFirstDot<S extends string> = S extends `${infer B}.${string}` ? B : S;
type DeriveLocalName<P extends string> = BeforeFirstDot<StripLeadingUnderscore<LastSegment<P>>>;
type CollectionAutoKeysFor<A extends string> = string extends A
  ? never
  : A | `${A}_counter` | `${A}_iteration`;
type CollectionLocals<
  P extends keyof TemplateRegistry,
  A extends string = DeriveLocalName<P>,
> = Omit<TemplateLocals<TemplateRegistry[P]>, CollectionAutoKeysFor<A>>;

type RenderCollectionOptions<P extends string, A extends string = DeriveLocalName<P>> = {
  partial: P;
  collection: readonly unknown[];
  as?: A;
  spacerTemplate?: string;
} & (P extends keyof TemplateRegistry
  ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} extends CollectionLocals<P, A>
    ? { locals?: CollectionLocals<P, A> }
    : { locals: CollectionLocals<P, A> }
  : { locals?: Record<string, unknown> });

export interface TseRenderContext {
  outputBuffer: OutputBuffer;

  capture(callback: () => void): SafeBuffer;

  concat(value: unknown): void;

  raw(value: unknown): SafeBuffer;

  yield(section?: string): SafeBuffer;

  contentFor(name: string, callback: () => void): void;

  render<P extends string, A extends string = DeriveLocalName<P>>(
    options: RenderOptions<P, A>,
  ): SafeBuffer;
}

export class TseRenderContextImpl implements TseRenderContext {
  outputBuffer: OutputBuffer;

  private _defaultYield: SafeBuffer = htmlSafe("");

  private _contentBuffers: Map<string, SafeBuffer> = new Map();

  constructor(outputBuffer: OutputBuffer = new OutputBuffer()) {
    this.outputBuffer = outputBuffer;
  }

  /** @internal */
  setDefaultYield(content: SafeBuffer): void {
    this._defaultYield = content;
  }

  capture(callback: () => void): SafeBuffer {
    const previous = this.outputBuffer;
    this.outputBuffer = new OutputBuffer();
    try {
      callback();
      return this.outputBuffer.toString();
    } finally {
      this.outputBuffer = previous;
    }
  }

  concat(value: unknown): void {
    this.outputBuffer.append(value);
  }

  raw(value: unknown): SafeBuffer {
    if (value instanceof OutputBuffer) return value.toString();
    return htmlSafe(String(value ?? ""));
  }

  yield(section?: string): SafeBuffer {
    if (section === undefined) return this._defaultYield;
    return this._contentBuffers.get(section) ?? htmlSafe("");
  }

  contentFor(name: string, callback: () => void): void {
    const captured = this.capture(callback);
    const existing = this._contentBuffers.get(name);
    this._contentBuffers.set(name, existing ? existing.concat(captured) : captured);
  }

  render<P extends string, A extends string = DeriveLocalName<P>>(
    options: RenderOptions<P, A>,
  ): SafeBuffer {
    const { partial, locals = {}, collection, as, spacerTemplate } = options;
    const localName = as ?? deriveLocalName(partial);

    if (collection !== undefined) {
      return this._renderCollection(partial, collection, localName, locals, spacerTemplate);
    }

    return this._renderPartial(partial, localName, locals);
  }

  /** @internal */
  protected _renderPartial(
    _partial: string,
    _localName: string,
    _locals: Record<string, unknown>,
  ): SafeBuffer {
    return htmlSafe("");
  }

  /** @internal */
  private _renderCollection(
    partial: string,
    collection: readonly unknown[],
    localName: string,
    extraLocals: Record<string, unknown>,
    spacerTemplate?: string,
  ): SafeBuffer {
    const buf = new OutputBuffer();
    const counterName = `${localName}_counter`;
    const iterationName = `${localName}_iteration`;
    const spacerLocalName = spacerTemplate !== undefined ? deriveLocalName(spacerTemplate) : "";
    const total = collection.length;

    for (let i = 0; i < total; i++) {
      if (i > 0 && spacerTemplate !== undefined) {
        buf.safeAppend(this._renderPartial(spacerTemplate, spacerLocalName, {}));
      }
      const locals: Record<string, unknown> = {
        ...extraLocals,
        [localName]: collection[i],
        [counterName]: i,
        [iterationName]: { index: i, size: total, first: i === 0, last: i === total - 1 },
      };
      buf.safeAppend(this._renderPartial(partial, localName, locals));
    }

    return buf.toString();
  }
}

/** @internal */
function deriveLocalName(partial: string): string {
  const last = partial.split("/").at(-1) ?? partial;
  return last.replace(/^_/, "").replace(/(\.[\w]+)+$/, "");
}
