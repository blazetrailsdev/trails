import { Marked, type Tokens } from "marked";

/**
 * The surface of the redcarpet gem Writebook calls, rendered by the `marked` npm
 * package until redcarpet is ported (story `redcarpet-port`). A renderer subclass
 * overrides `header` and `image` with redcarpet's signatures.
 */
class HTML {
  options: { filterHtml?: boolean };

  constructor(options: { filterHtml?: boolean } = {}) {
    this.options = options;
  }

  header(text: string, headerLevel: number): string | null {
    return `<h${headerLevel}>${text}</h${headerLevel}>\n`;
  }

  image(url: string, title: string | null, altText: string): string | null {
    return `<img src="${url}" alt="${altText}"${title ? ` title="${title}"` : ""}>`;
  }
}

class Markdown {
  renderer: HTML;
  extensions: Record<string, boolean>;

  constructor(renderer: HTML, extensions: Record<string, boolean> = {}) {
    this.renderer = renderer;
    this.extensions = extensions;
  }

  render(text: string): string {
    const renderer = this.renderer;
    const marked = new Marked({ gfm: true, breaks: false, async: false });
    marked.use({
      extensions: [
        {
          name: "image",
          level: "inline",
          start: (src: string) => src.indexOf("!["),
          // redcarpet's char_link takes the title from the first quote to the last one before `)`
          // (markdown.c), where CommonMark rejects a title holding an unescaped quote.
          tokenizer(src: string) {
            const match = /^!\[([^\]]*)\]\(\s*([^\s)]+)\s+(["'])(.*)\3\s*\)/.exec(src);
            if (!match) return undefined;
            return {
              type: "image",
              raw: match[0],
              href: match[2],
              title: match[4],
              text: match[1],
            };
          },
        },
      ],
      renderer: {
        heading(
          this: { parser: { parseInline(t: Tokens.Generic[]): string } },
          token: Tokens.Heading,
        ) {
          return renderer.header(this.parser.parseInline(token.tokens), token.depth) ?? false;
        },
        image(token: Tokens.Image) {
          return renderer.image(token.href, token.title ?? null, token.text) ?? false;
        },
      },
    });
    return marked.parse(text ?? "") as string;
  }
}

export const Redcarpet = { Markdown, Render: { HTML } };

export declare namespace Redcarpet {
  type Markdown = InstanceType<typeof Markdown>;
  namespace Render {
    type HTML = InstanceType<typeof HTML>;
  }
}
