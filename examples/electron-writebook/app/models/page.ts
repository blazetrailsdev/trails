import { htmlEscape, type SafeBuffer } from "@blazetrails/activesupport";
import { Content } from "@blazetrails/actiontext";
import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationRecord } from "./application-record.ts";
import { Leafable } from "./leafable.ts";
import { Redcarpet } from "../../lib/redcarpet.ts";
import { Markdown } from "../../lib/trails-ext/action-text-markdown.ts";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Page extends Included<typeof Leafable>, Leafable {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Page extends ApplicationRecord {
  static previewRenderer = new Redcarpet.Markdown(
    new Redcarpet.Render.HTML(Markdown.DEFAULT_RENDERER_OPTIONS),
    Markdown.DEFAULT_MARKDOWN_EXTENSIONS,
  );

  declare body: () => Promise<Markdown>;
  declare setBody: (content: string) => Promise<void>;

  static {
    include(this, Leafable);

    this.hasMarkdown("body");
  }

  async searchableContent(): Promise<SafeBuffer> {
    return htmlEscape(await this._plainText());
  }

  async htmlPreview(): Promise<string> {
    return this._renderedHtml((await this._markdownSource()).slice(0, 1024));
  }

  async markable(): Promise<string> {
    return String((await this.body()).content ?? "");
  }

  private async _plainText(): Promise<string> {
    const htmlBody = this._renderedHtml(await this._markdownSource());
    return await (await Content.new(htmlBody)).toPlainText();
  }

  private _renderedHtml(source: string): string {
    return Page.previewRenderer.render(source);
  }

  private async _markdownSource(): Promise<string> {
    return String((await this.body()).content ?? "");
  }
}
