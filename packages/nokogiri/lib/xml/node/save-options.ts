export class SaveOptions {
  static readonly FORMAT = 1;
  static readonly NO_DECLARATION = 2;
  static readonly NO_EMPTY_TAGS = 4;
  static readonly NO_XHTML = 8;
  static readonly AS_XHTML = 16;
  static readonly AS_XML = 32;
  static readonly AS_HTML = 64;

  static readonly DEFAULT_XML = SaveOptions.FORMAT | SaveOptions.AS_XML;
  static readonly DEFAULT_HTML =
    SaveOptions.FORMAT |
    SaveOptions.NO_DECLARATION |
    SaveOptions.NO_EMPTY_TAGS |
    SaveOptions.AS_HTML;
  static readonly DEFAULT_XHTML =
    SaveOptions.FORMAT | SaveOptions.NO_DECLARATION | SaveOptions.AS_XHTML;

  declare format: () => this;
  declare isFormat: () => boolean;
  declare noDeclaration: () => this;
  declare isNoDeclaration: () => boolean;
  declare noEmptyTags: () => this;
  declare isNoEmptyTags: () => boolean;
  declare noXhtml: () => this;
  declare isNoXhtml: () => boolean;
  declare asXhtml: () => this;
  declare isAsXhtml: () => boolean;
  declare asXml: () => this;
  declare isAsXml: () => boolean;
  declare asHtml: () => this;
  declare isAsHtml: () => boolean;

  options: number;

  constructor(options = 0) {
    this.options = options;
  }

  toI(): number {
    return this.options;
  }

  inspect(): string {
    const options: string[] = [];
    for (const k of CONSTANTS) {
      if ((this as unknown as Record<string, () => boolean>)[`is${camel(k)}`]()) {
        options.push(k.toLowerCase());
      }
    }
    return `#<Nokogiri::XML::Node::SaveOptions options=${this.options} ${options.join(", ")}>`;
  }
}

const CONSTANTS = [
  "FORMAT",
  "NO_DECLARATION",
  "NO_EMPTY_TAGS",
  "NO_XHTML",
  "AS_XHTML",
  "AS_XML",
  "AS_HTML",
  "DEFAULT_XML",
  "DEFAULT_HTML",
  "DEFAULT_XHTML",
] as const;

function camel(constant: string): string {
  return constant.toLowerCase().replace(/(^|_)([a-z])/g, (_m, _u, c: string) => c.toUpperCase());
}

for (const constant of CONSTANTS) {
  const value = SaveOptions[constant];
  const name = camel(constant);
  Object.defineProperty(SaveOptions.prototype, name[0].toLowerCase() + name.slice(1), {
    value(this: SaveOptions) {
      this.options |= value;
      return this;
    },
  });
  Object.defineProperty(SaveOptions.prototype, `is${name}`, {
    value(this: SaveOptions) {
      return (this.options & value) === value;
    },
  });
}
