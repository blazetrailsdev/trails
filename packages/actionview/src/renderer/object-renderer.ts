import { localVariable, partialPath } from "./abstract-renderer.js";
import type {
  ObjectRenderingHost,
  RenderableTemplate,
  RenderedTemplate,
  ViewContext,
} from "./abstract-renderer.js";
import type { LookupContext } from "../lookup-context.js";
import type { RenderOptions } from "./abstract-renderer.js";
import { PartialRenderer } from "./partial-renderer.js";

/** @internal */
export class ObjectRenderer extends PartialRenderer implements ObjectRenderingHost {
  /** @internal */
  localVariable = localVariable;
  /** @internal */
  partialPath = partialPath;

  /** @internal */
  contextPrefix: string;
  private object: unknown = null;
  private localName: string | null = null;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext, options);
    this.contextPrefix = lookupContext.prefixes[0] ?? "";
  }

  async renderObjectWithPartial(
    object: unknown,
    partial: string,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    this.object = object;
    this.localName = this.localVariable(partial);
    return this.render(partial, context, block);
  }

  async renderObjectDerivePartial(
    object: unknown,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    const path = this.partialPath(object, context);
    return this.renderObjectWithPartial(object, path, context, block);
  }

  /** @internal */
  protected override templateKeys(path: string): string[] {
    return [...super.templateKeys(path), ...(this.localName != null ? [this.localName] : [])];
  }

  /** @internal */
  protected override async renderPartialTemplate(
    view: ViewContext,
    locals: Record<string, unknown>,
    template: RenderableTemplate,
    layout: RenderableTemplate | null,
    block: unknown,
  ): Promise<RenderedTemplate> {
    locals[this.localName ?? template.variable!] = this.object;
    return super.renderPartialTemplate(view, locals, template, layout, block);
  }
}
