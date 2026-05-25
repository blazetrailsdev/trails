import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { OutputBuffer } from "./buffers.js";
import type { TemplateLocals, TemplateRegistry } from "./template-registry.js";

/**
 * Options for `render()` with a statically-typed partial name.
 * Mirrors Rails' `render partial:, locals:, collection:, as:, spacer_template:`.
 * `locals` is required when the registered partial has required properties,
 * optional when all properties are optional (matching the `.tse` virtualized shim).
 */
export type PartialOptions<K extends keyof TemplateRegistry> = {
  partial: K;
  collection?: readonly unknown[];
  as?: string;
  spacerTemplate?: string;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
} & ({} extends TemplateLocals<TemplateRegistry[K]>
  ? { locals?: TemplateLocals<TemplateRegistry[K]> }
  : { locals: TemplateLocals<TemplateRegistry[K]> });

/**
 * Options for `render()` with a dynamic partial name (string, not a literal
 * registry key). Locals type degrades to `Record<string, unknown>`.
 */
export type DynamicPartialOptions = {
  partial: string;
  locals?: Record<string, unknown>;
  collection?: readonly unknown[];
  as?: string;
  spacerTemplate?: string;
};

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
   * Render a partial with typed locals when `partial` is a literal key known
   * to the `TemplateRegistry`. `rails partial_renderer.rb`.
   *
   * Static form: `render({ partial: "users/user", locals: { user } })`
   * Collection form: `render({ partial: "users/user", collection: users, as: "user" })`
   */
  render<K extends keyof TemplateRegistry>(options: PartialOptions<K>): SafeBuffer;

  /**
   * Dynamic form: partial name is a runtime `string`. Locals fall back to
   * `Record<string, unknown>`.
   */
  render(options: DynamicPartialOptions): SafeBuffer;
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
    // OutputBuffer.toString() returns a non-primitive SafeBuffer, breaking String() coercion.
    if (value instanceof OutputBuffer) return value.toString();
    if (value instanceof SafeBuffer) return value;
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

  render<K extends keyof TemplateRegistry>(options: PartialOptions<K>): SafeBuffer;
  render(options: DynamicPartialOptions): SafeBuffer;
  render(options: DynamicPartialOptions): SafeBuffer {
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
