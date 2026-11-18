import { runLoadHooks, type SafeBuffer } from "@blazetrails/activesupport";
import { include, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../../turbo-trails.js";
import { ActionHelper } from "../../../helpers/turbo/streams/action-helper.js";

type Options = Record<string, unknown>;
type Block = (...args: unknown[]) => unknown;
type Opts = Options | Block;

interface ViewContext {
  formats: unknown;
  render(options: Options, locals?: Options, block?: Block): unknown;
  capture(block: Block): unknown;
}

export class TagBuilder {
  declare turboStreamActionTag: OmitThisParameter<typeof ActionHelper.turboStreamActionTag>;
  declare turboStreamRefreshTag: OmitThisParameter<typeof ActionHelper.turboStreamRefreshTag>;

  /** @internal */
  viewContext: ViewContext;

  constructor(viewContext: object) {
    this.viewContext = viewContext as ViewContext;
    const formats = (this.viewContext.formats as string[] | null | undefined) ?? [];
    this.viewContext.formats = formats.includes(":html") ? formats : [...formats, ":html"];
  }

  remove(target: unknown) {
    return this.action("remove", target, null, { allowInferredRendering: false });
  }

  removeAll(targets: unknown) {
    return this.actionAll("remove", targets, null, { allowInferredRendering: false });
  }

  replace(target: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.action("replace", target, content, rendering, block);
  }

  replaceAll(targets: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.actionAll("replace", targets, content, rendering, block);
  }

  before(target: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.action("before", target, content, rendering, block);
  }

  beforeAll(targets: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.actionAll("before", targets, content, rendering, block);
  }

  after(target: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.action("after", target, content, rendering, block);
  }

  afterAll(targets: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.actionAll("after", targets, content, rendering, block);
  }

  update(target: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.action("update", target, content, rendering, block);
  }

  updateAll(targets: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.actionAll("update", targets, content, rendering, block);
  }

  append(target: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.action("append", target, content, rendering, block);
  }

  appendAll(targets: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.actionAll("append", targets, content, rendering, block);
  }

  prepend(target: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.action("prepend", target, content, rendering, block);
  }

  prependAll(targets: unknown, content: unknown = null, rendering: Opts = {}, block?: Block) {
    if (typeof rendering === "function") [rendering, block] = [{}, rendering];
    if (typeof content === "function") [content, block] = [null, content as Block];
    else if ((content as object | null)?.constructor === Object)
      [content, rendering] = [null, content as Options];
    return this.actionAll("prepend", targets, content, rendering, block);
  }

  refresh(options: Options = {}): SafeBuffer {
    return this.turboStreamRefreshTag(options);
  }

  async action(
    name: string,
    target: unknown,
    content: unknown = null,
    { method = null, allowInferredRendering = true, ...rendering }: Options = {},
    block?: Block,
  ): Promise<SafeBuffer> {
    const template = await this.renderTemplate(
      target,
      content,
      { allowInferredRendering, ...rendering },
      block,
    );

    return this.turboStreamActionTag(name, { target, template, method });
  }

  async actionAll(
    name: string,
    targets: unknown,
    content: unknown = null,
    { method = null, allowInferredRendering = true, ...rendering }: Options = {},
    block?: Block,
  ): Promise<SafeBuffer> {
    const template = await this.renderTemplate(
      targets,
      content,
      { allowInferredRendering, ...rendering },
      block,
    );

    return this.turboStreamActionTag(name, { targets, template, method });
  }

  /** @internal */
  renderTemplate(
    target: unknown,
    content: unknown = null,
    { allowInferredRendering = true, ...rendering }: Options = {},
    block?: Block,
  ): unknown {
    if (rbObjRespondTo(target, "renderIn") && content == null) {
      return (target as { renderIn(viewContext: ViewContext, block?: Block): unknown }).renderIn(
        this.viewContext,
        block,
      );
    } else if (rbObjRespondTo(content, "renderIn")) {
      return (content as { renderIn(viewContext: ViewContext, block?: Block): unknown }).renderIn(
        this.viewContext,
        block,
      );
    } else if (content != null && content !== false) {
      return allowInferredRendering ? (this.renderRecord(content) ?? content) : content;
    } else if (block && ("partial" in rendering || "layout" in rendering)) {
      return this.viewContext.render(
        { formats: [":html"], layout: rendering["partial"], ...rendering },
        {},
        block,
      );
    } else if (block) {
      return this.viewContext.capture(block);
    } else if (Object.keys(rendering).length > 0) {
      return this.viewContext.render({ formats: [":html"], ...rendering });
    } else {
      if (allowInferredRendering) return this.renderRecord(target);
    }
  }

  /** @internal */
  renderRecord(possibleRecord: unknown): unknown {
    if (rbObjRespondTo(possibleRecord, "toPartialPath")) {
      const record = possibleRecord;
      return this.viewContext.render({ partial: record, formats: ":html" });
    }
  }
}
include(TagBuilder, ActionHelper);
Turbo.Streams.TagBuilder = TagBuilder;
runLoadHooks("turbo_streams_tag_builder", TagBuilder);
