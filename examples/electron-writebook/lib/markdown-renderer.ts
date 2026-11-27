import { htmlEscapeOnce, parameterize } from "@blazetrails/activesupport";
import { Redcarpet } from "./redcarpet.ts";
import { Markdown as ActionTextMarkdown } from "./trails-ext/action-text-markdown.ts";

export class MarkdownRenderer extends Redcarpet.Render.HTML {
  private _idCounts = new Map<string, number>();

  static build(): Redcarpet.Markdown {
    const renderer = new MarkdownRenderer(ActionTextMarkdown.DEFAULT_RENDERER_OPTIONS);
    return new Redcarpet.Markdown(renderer, ActionTextMarkdown.DEFAULT_MARKDOWN_EXTENSIONS);
  }

  override header(text: string, headerLevel: number): string {
    const id = this._uniqueId(text);
    return `<h${headerLevel} id='${id}'>${text} <a href='#${id}' class='heading__link' aria-hidden='true'>#</a></h${headerLevel}>`;
  }

  override image(url: string, title: string | null, altText: string): string {
    [url, title, altText] = [url, title, altText].map((it) => String(htmlEscapeOnce(it ?? "")));
    return `<a title="${title}" data-action="lightbox#open:prevent" data-lightbox-target="image" data-lightbox-url-value="${url}?disposition=attachment" href="${url}"><img src="${url}" alt="${altText}"></a>`;
  }

  private _uniqueId(text: string): string {
    const baseId = parameterize(text);
    const count = (this._idCounts.get(baseId) ?? 0) + 1;
    this._idCounts.set(baseId, count);
    return count > 1 ? `${baseId}-${count}` : baseId;
  }
}
