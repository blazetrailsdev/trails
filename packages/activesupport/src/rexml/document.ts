/**
 * The slice of Ruby's REXML that `XmlMini_REXML` uses (`require
 * "rexml/document"`, rexml.rb:3): `REXML::Document`, the `Element`/`Text`
 * nodes it exposes, and `REXML::ParseException`.
 *
 * REXML is Ruby stdlib, not Rails, so it has no `vendor/rails` counterpart and
 * no parity population — this file stands in for the gem the way
 * `@blazetrails/date` stands in for `date`. The names and semantics are REXML's
 * (`Document#root`, `Element#has_elements?`, `#each_element`, `#has_text?`,
 * `#texts`, `#attributes`, `Text#value`), so the ported `xml-mini/rexml.ts`
 * bodies read as the Ruby ones.
 */

/**
 * Mirrors: REXML::ParseException.
 *
 * @noRailsEquivalent PERMANENT — `REXML::ParseException` is Ruby stdlib (rexml/document.rb),
 * not Rails; `XmlMini_REXML` `require`s it.
 */
export class ParseException extends Error {
  /** The Ruby class name, which is what `rescue`/message formatting shows. */
  override name = "REXML::ParseException";
}

/**
 * Mirrors: REXML::Text — a text (or CDATA) node.
 *
 * @noRailsEquivalent PERMANENT — `REXML::Text` is Ruby stdlib (rexml/document.rb),
 * not Rails; `XmlMini_REXML` `require`s it.
 */
export class Text {
  constructor(public readonly value: string) {}
}

/**
 * Mirrors: REXML::Attributes — the attribute table of an element, iterated by
 * `attributes.each { |n, v| ... }`.
 *
 * @noRailsEquivalent PERMANENT — `REXML::Attributes` is Ruby stdlib (rexml/document.rb),
 * not Rails; `XmlMini_REXML` `require`s it.
 */
export class Attributes {
  private readonly entries = new Map<string, string>();

  set(name: string, value: string): void {
    this.entries.set(name, value);
  }

  each(fn: (name: string, value: string) => void): void {
    for (const [name, value] of this.entries) fn(name, value);
  }
}

/**
 * Mirrors: REXML::Element.
 *
 * @noRailsEquivalent PERMANENT — `REXML::Element` is Ruby stdlib (rexml/document.rb),
 * not Rails; `XmlMini_REXML` `require`s it.
 */
export class Element {
  readonly attributes = new Attributes();
  readonly children: Array<Element | Text> = [];

  constructor(public readonly name: string) {}

  /**
   * Mirrors: REXML::Element#has_elements?.
   *
   * @noRailsEquivalent PERMANENT — a `REXML::` member (Ruby stdlib rexml/document.rb),
   * not Rails.
   */
  hasElements(): boolean {
    return this.children.some((child) => child instanceof Element);
  }

  /**
   * Mirrors: REXML::Element#each_element.
   *
   * @noRailsEquivalent PERMANENT — a `REXML::` member (Ruby stdlib rexml/document.rb),
   * not Rails.
   */
  eachElement(fn: (child: Element) => void): void {
    for (const child of this.children) if (child instanceof Element) fn(child);
  }

  /**
   * Mirrors: REXML::Element#has_text?.
   *
   * @noRailsEquivalent PERMANENT — a `REXML::` member (Ruby stdlib rexml/document.rb),
   * not Rails.
   */
  hasText(): boolean {
    return this.children.some((child) => child instanceof Text);
  }

  /**
   * Mirrors: REXML::Element#texts — the element's direct text children.
   *
   * @noRailsEquivalent PERMANENT — a `REXML::` member (Ruby stdlib rexml/document.rb),
   * not Rails.
   */
  get texts(): Text[] {
    return this.children.filter((child): child is Text => child instanceof Text);
  }

  /**
   * Mirrors: REXML::Element#to_s — serializes the element back to XML.
   *
   * @noRailsEquivalent PERMANENT — a `REXML::` member (Ruby stdlib rexml/document.rb),
   * not Rails.
   */
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

/**
 * Resolve the standard entities and numeric character references. Entities
 * declared in an internal DTD subset are deliberately NOT expanded: that is the
 * billion-laughs vector, and REXML caps expansion for the same reason.
 */
function unescapeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[^;\s&]+);/g, (match, ref: string) => {
    if (ref.startsWith("#")) {
      const code = ref.startsWith("#x") ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES[ref] ?? match;
  });
}

const NAME = /[^\s/>]+/y;

/**
 * Mirrors: REXML::Document — parses an XML document string into a node tree.
 *
 * @noRailsEquivalent PERMANENT — `REXML::Document` is Ruby stdlib (rexml/document.rb),
 * not Rails; `XmlMini_REXML` `require`s it.
 */
export class Document {
  /**
   * Mirrors: REXML::Document#root — the root element, or `undefined`.
   *
   * @noRailsEquivalent PERMANENT — a `REXML::` member (Ruby stdlib rexml/document.rb),
   * not Rails.
   */
  root: Element | undefined;

  constructor(source: string) {
    this.parse(source);
  }

  /**
   * Mirrors: REXML::Document#to_s.
   *
   * @noRailsEquivalent PERMANENT — a `REXML::` member (Ruby stdlib rexml/document.rb),
   * not Rails.
   */
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
        if (parent) parent.children.push(new Text(unescapeXml(text)));
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
        if (parent) parent.children.push(new Text(source.slice(pos + 9, end)));
        pos = end + 3;
      } else if (source.startsWith("<!", pos)) {
        // A DOCTYPE, with or without an internal subset.
        const subset = source.indexOf("[", pos);
        const close = source.indexOf(">", pos);
        if (close === -1) fail(`Missing end of declaration at ${pos}`);
        if (subset !== -1 && subset < close) {
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
      element.attributes.set(match[1], unescapeXml(match[3] ?? match[4]));
      pos = attribute.lastIndex;
    }
  }
}
