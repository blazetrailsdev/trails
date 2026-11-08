import { RuntimeError } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export class ParseException extends Error {
  override name = "REXML::ParseException";
}

/** @noRailsEquivalent PERMANENT */
export class Text {
  constructor(
    private readonly raw: string,
    private readonly entities: Record<string, string> = {},
  ) {}

  /** @noRailsEquivalent PERMANENT */
  get value(): string {
    return unescapeXml(this.raw, this.entities);
  }
}

/** @noRailsEquivalent PERMANENT */
export class Attributes {
  private readonly entries = new Map<string, string>();

  set(name: string, value: string): void {
    this.entries.set(name, value);
  }

  each(fn: (name: string, value: string) => void): void {
    for (const [name, value] of this.entries) fn(name, value);
  }
}

/** @noRailsEquivalent PERMANENT */
export class Element {
  readonly attributes = new Attributes();
  readonly children: Array<Element | Text> = [];

  constructor(public readonly name: string) {}

  /** @noRailsEquivalent PERMANENT */
  hasElements(): boolean {
    return this.children.some((child) => child instanceof Element);
  }

  /** @noRailsEquivalent PERMANENT */
  eachElement(fn: (child: Element) => void): void {
    for (const child of this.children) if (child instanceof Element) fn(child);
  }

  /** @noRailsEquivalent PERMANENT */
  hasText(): boolean {
    return this.children.some((child) => child instanceof Text);
  }

  /** @noRailsEquivalent PERMANENT */
  get texts(): Text[] {
    return this.children.filter((child): child is Text => child instanceof Text);
  }

  /** @noRailsEquivalent PERMANENT */
  toString(): string {
    let attrs = "";
    this.attributes.each((name, value) => {
      attrs += ` ${name}='${escapeXml(value)}'`;
    });
    if (this.children.length === 0) return `<${this.name}${attrs}/>`;
    const body = this.children
      .map((child) => (child instanceof Element ? child.toString() : escapeXml(child.value)))
      .join("");
    return `<${this.name}${attrs}>${body}</${this.name}>`;
  }
}

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { RuntimeError };

const ENTITY_EXPANSION_LIMIT = 10000;

const ENTITY_EXPANSION_TEXT_LIMIT = 10240;

function unescapeXml(text: string, entities: Record<string, string> = {}): string {
  let expansions = 0;

  const expand = (source: string): string =>
    source.replace(/&(#x?[0-9a-fA-F]+|[^;\s&]+);/g, (match, ref: string) => {
      if (ref.startsWith("#")) {
        const code = ref.startsWith("#x") ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (ENTITIES[ref] !== undefined) return ENTITIES[ref];
      const value = entities[ref];
      if (value === undefined) return match;
      expansions += 1;
      if (expansions > ENTITY_EXPANSION_LIMIT) {
        throw new RuntimeError("number of entity expansions exceeded, processing aborted");
      }
      const expanded = expand(value);
      if (expanded.length > ENTITY_EXPANSION_TEXT_LIMIT) {
        throw new RuntimeError("entity expansion has grown too large");
      }
      return expanded;
    });

  const result = expand(text);
  if (result.length > ENTITY_EXPANSION_TEXT_LIMIT) {
    throw new RuntimeError("entity expansion has grown too large");
  }
  return result;
}

function parseEntityDeclarations(subset: string): Record<string, string> {
  const entities: Record<string, string> = {};
  const declaration = /<!ENTITY\s+([^\s%]+)\s+("([^"]*)"|'([^']*)')\s*>/g;
  for (const m of subset.matchAll(declaration)) entities[m[1]] = m[3] ?? m[4];
  return entities;
}

const NAME = /[^\s/>]+/y;

/** @noRailsEquivalent PERMANENT */
export class Document {
  /** @noRailsEquivalent PERMANENT */
  root: Element | undefined;

  private entities: Record<string, string> = {};

  constructor(source: string) {
    this.parse(source);
  }

  /** @noRailsEquivalent PERMANENT */
  toString(): string {
    return this.root ? this.root.toString() : "";
  }

  private parse(source: string): void {
    const stack: Element[] = [];
    let pos = 0;

    const fail = (message: string): never => {
      throw new ParseException(message);
    };

    const skipTo = (marker: string): void => {
      const end = source.indexOf(marker, pos);
      if (end === -1) fail(`Missing end of ${marker} at ${pos}`);
      pos = end + marker.length;
    };

    while (pos < source.length) {
      const next = source.indexOf("<", pos);
      if (next === -1) break;

      if (next > pos) {
        const text = source.slice(pos, next);
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(new Text(text, this.entities));
        pos = next;
      }

      if (source.startsWith("<?", pos)) {
        skipTo("?>");
      } else if (source.startsWith("<!--", pos)) {
        skipTo("-->");
      } else if (source.startsWith("<![CDATA[", pos)) {
        const end = source.indexOf("]]>", pos);
        if (end === -1) fail(`Missing end of CDATA at ${pos}`);
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(new Text(escapeXml(source.slice(pos + 9, end))));
        pos = end + 3;
      } else if (source.startsWith("<!", pos)) {
        const subset = source.indexOf("[", pos);
        const close = source.indexOf(">", pos);
        if (close === -1) fail(`Missing end of declaration at ${pos}`);
        if (subset !== -1 && subset < close) {
          const subsetEnd = source.indexOf("]", subset);
          if (subsetEnd === -1) fail(`Missing end of declaration at ${pos}`);
          this.entities = parseEntityDeclarations(source.slice(subset + 1, subsetEnd));
          skipTo("]");
          skipTo(">");
        } else {
          pos = close + 1;
        }
      } else if (source.startsWith("</", pos)) {
        pos += 2;
        NAME.lastIndex = pos;
        const match = NAME.exec(source);
        if (!match) fail(`Malformed closing tag at ${pos}`);
        const open = stack.pop();
        if (!open || open.name !== match![0]) {
          fail(`Missing end tag for '${open ? open.name : match![0]}'`);
        }
        pos = NAME.lastIndex;
        const close = source.indexOf(">", pos);
        if (close === -1) fail(`Missing end of closing tag at ${pos}`);
        pos = close + 1;
      } else {
        pos += 1;
        NAME.lastIndex = pos;
        const match = NAME.exec(source);
        if (!match) fail(`Malformed element at ${pos}`);
        pos = NAME.lastIndex;
        const element = new Element(match![0]);
        pos = this.parseAttributes(source, pos, element, fail);
        const selfClosing = source.startsWith("/>", pos);
        pos += selfClosing ? 2 : 1;

        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(element);
        else if (this.root) fail("Malformed XML: Extra tag at the end of the document");
        else this.root = element;

        if (!selfClosing) stack.push(element);
      }
    }

    if (stack.length > 0) fail(`Missing end tag for '${stack[stack.length - 1].name}'`);
  }

  private parseAttributes(
    source: string,
    start: number,
    element: Element,
    fail: (message: string) => never,
  ): number {
    let pos = start;
    const attribute = /\s*([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/y;
    for (;;) {
      while (pos < source.length && /\s/.test(source[pos])) pos += 1;
      if (pos >= source.length) fail("Missing end of start tag");
      if (source.startsWith("/>", pos) || source[pos] === ">") return pos;
      attribute.lastIndex = pos;
      const match = attribute.exec(source);
      if (!match) fail(`Malformed attribute at ${pos}`);
      element.attributes.set(match[1], unescapeXml(match[3] ?? match[4], this.entities));
      pos = attribute.lastIndex;
    }
  }
}
