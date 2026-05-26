import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { OutputBuffer } from "./buffers.js";
import type { TemplateLocals, TemplateRegistry } from "./template-registry.js";

/**
 * Render options with a single conditional-generic signature. When `P` is a
 * literal key in `TemplateRegistry`, locals are typed (and required when the
 * registered shape has required properties). When `P` is a plain `string`,
 * locals fall back to `Record<string, unknown>`.
 */
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

/**
 * Per-render execution context passed to compiled `.tse` templates.
 *
 * Mirrors the subset of ActionView::Base that ERB templates interact with for
 * output capture (`with_output_buffer`), direct concatenation, and raw output.
 * See `actionview/lib/action_view/helpers/capture_helper.rb` and
 * `output_safety_helper.rb`.
 */
export interface TseRenderContext {
  /** Currently-active output buffer. Swapped by {@link capture}. */
  outputBuffer: OutputBuffer;

  /**
   * Redirect output to a fresh buffer for the duration of `callback`, then
   * restore the previous buffer and return captured content as a SafeBuffer.
   * Mirrors Rails `capture` (implemented via `with_output_buffer` semantics).
   */
  capture(callback: () => void): SafeBuffer;

  /**
   * Append `value` to the currently-active buffer, escaping unless html-safe.
   * Mirrors Rails `concat`.
   */
  concat(value: unknown): void;

  /**
   * Mark `value` as HTML-safe without escaping. Mirrors Rails `raw`.
   */
  raw(value: unknown): SafeBuffer;

  /**
   * In a layout: return the inner template's rendered output (default yield)
   * or a named `content_for` buffer. Returns an empty SafeBuffer when the
   * named section has no content. Mirrors Rails `<%= yield %>` /
   * `<%= yield :name %>` in layouts.
   */
  yield(section?: string): SafeBuffer;

  /**
   * Capture `callback` output and append it to the named section buffer.
   * Multiple calls with the same name concatenate (Rails behavior).
   * Mirrors Rails `<% content_for(:name) { ... } %>`.
   */
  contentFor(name: string, callback: () => void): void;

  /**
   * Render a partial. When `partial` is a literal key known to
   * `TemplateRegistry`, locals are typed (and required when the registered
   * shape has required properties). A plain `string` falls back to
   * `Record<string, unknown>`. Collection renders (`collection:` present)
   * omit auto-injected keys (item, counter, iteration) from the locals
   * requirement when `as` is a literal type; a wide `string` preserves
   * all locals requirements. Remaining required keys must still be provided.
   * `spacerTemplate` is only accepted on collection renders.
   * `rails partial_renderer.rb`.
   *
   * Static form: `render({ partial: "users/user", locals: { user } })`
   * Collection form: `render({ partial: "users/user", collection: users, as: "user" })`
   */
  render<P extends string, A extends string = DeriveLocalName<P>>(
    options: RenderOptions<P, A>,
  ): SafeBuffer;
}

/**
 * Default implementation of {@link TseRenderContext}.
 */
export class TseRenderContextImpl implements TseRenderContext {
  outputBuffer: OutputBuffer;

  /** Default yield content (inner template output). Set by the renderer before invoking a layout. */
  private _defaultYield: SafeBuffer = htmlSafe("");

  /** Named content_for buffers. Multiple appends concatenate per Rails behavior. */
  private _contentBuffers: Map<string, SafeBuffer> = new Map();

  constructor(outputBuffer: OutputBuffer = new OutputBuffer()) {
    this.outputBuffer = outputBuffer;
  }

  /**
   * Set the default yield content (inner template output).
   * Called by the renderer after rendering the inner template and before invoking the layout.
   * @internal
   */
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

  /**
   * Stub — actual template loading + execution lands in Phase 2c/3 with the
   * renderer substrate. Subclasses (and tests) may override to inject behavior.
   * @internal
   */
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

/**
 * Derives the default local variable name from a partial path.
 * Mirrors Rails `AbstractRenderer#local_variable`:
 * take basename, strip optional leading `_`, strip trailing `.\w+` extension segments.
 * e.g. "users/user" → "user", "shared/_form.html" → "form", "a/_b.en.html" → "b".
 * @internal
 */
function deriveLocalName(partial: string): string {
  const last = partial.split("/").at(-1) ?? partial;
  return last.replace(/^_/, "").replace(/(\.[\w]+)+$/, "");
}
