import type { SafeBuffer } from "@blazetrails/activesupport";
import { safeJoin, FormBuilder } from "@blazetrails/actionview";
import type { Base } from "@blazetrails/activerecord";
import { humanize } from "@blazetrails/activesupport";
import { Markdown } from "./action-text-markdown.ts";
import type { ViewHost } from "./view-host.ts";

type ContentTag = (name: string, content: unknown, options?: object) => SafeBuffer;

type MarkdownRecord = Base & { toSignedGlobalId(options: object): { toString(): string } };

/**
 * Writebook's reopen of `ActionText::TagHelper`
 * (`vendor/writebook/v1.2.9/lib/rails_ext/action_text_tag_helper.rb`), registered
 * with `helper` by ApplicationController rather than spliced into ActionText's module.
 */
export const TagHelper = {
  markdownArea(
    this: ViewHost,
    record: MarkdownRecord,
    name: string,
    {
      value = null,
      data = {},
      ...options
    }: { value?: string | null; data?: Record<string, unknown> } & Record<string, unknown> = {},
  ): SafeBuffer {
    const modelName = (record.constructor as unknown as { modelName: { paramKey: string } })
      .modelName;
    const fieldName = `${modelName.paramKey}[${name}]`;

    const merged = {
      uploadsUrl: (this.actionTextMarkdownUploadsUrl as (o: object) => string)({
        record_gid: (this.uploadsSignedIdFor as (r: MarkdownRecord) => string)(record),
        attribute_name: name,
        format: "json",
      }),
      ...data,
    };

    return this.tag().house_md(value ?? "", { name: fieldName, data: merged, ...options });
  },

  uploadsSignedIdFor(this: ViewHost, record: MarkdownRecord): string {
    return record
      .toSignedGlobalId({
        expiresIn: Markdown.UPLOADS_SIGNED_ID_EXPIRY,
        for: Markdown.UPLOADS_SIGNED_ID_PURPOSE,
      })
      .toString();
  },

  async houseToolbar(
    this: ViewHost,
    options: Record<string, unknown> = {},
    block?: () => unknown,
  ): Promise<SafeBuffer> {
    const content = await (this.capture as (b?: () => unknown) => unknown)(block);
    return (this.contentTag as ContentTag)("house-md-toolbar", content, options);
  },

  async houseToolbarButton(
    this: ViewHost,
    action: string,
    options: Record<string, unknown> = {},
    block?: () => unknown,
  ): Promise<SafeBuffer> {
    const content = await (this.capture as (b?: () => unknown) => unknown)(block);
    return (this.contentTag as ContentTag)("button", content, {
      title: humanize(action),
      data: { houseMdAction: action },
      ...options,
    });
  },

  async houseToolbarFileUploadButton(
    this: ViewHost,
    { name = "upload", title = "Upload File", ...options }: Record<string, unknown> = {},
    block?: () => unknown,
  ): Promise<SafeBuffer> {
    const content = await (this.capture as (b?: () => unknown) => unknown)(block);
    return (this.contentTag as ContentTag)(
      "label",
      safeJoin([
        (this.fileFieldTag as (n: unknown, o: object) => SafeBuffer)(name, {
          data: { houseMdToolbarFilePicker: true },
          style: "display: none;",
        }),
        content,
      ]),
      { title, ...options },
    );
  },
};

Object.defineProperty(FormBuilder.prototype, "markdownArea", {
  value: function (
    this: { _template: typeof TagHelper; object: MarkdownRecord },
    method: string,
    options: Record<string, unknown> = {},
  ) {
    return TagHelper.markdownArea.call(
      this._template as unknown as ViewHost,
      this.object,
      method,
      options,
    );
  },
  writable: true,
  configurable: true,
});
