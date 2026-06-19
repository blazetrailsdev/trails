const CONTENT_KEY = "__content__";

function isModuleNotFound(e: unknown, pkg: string): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return code === "ERR_MODULE_NOT_FOUND" && e.message.includes(pkg);
}
const HASH_SIZE_KEY = "__hash_size__";

type XmlHash = Record<string, unknown>;

// @blazetrails/nokogiri is an optional peer dependency, so it may not be
// resolvable when this file is type-checked in isolation (e.g. before its
// `dist` is built). These local interfaces describe the slice of the Nokogiri
// SAX surface used below so the dynamic import stays well-typed — including the
// seven `override` members on HashBuilder — without depending on the package's
// own declarations being present.
interface SaxDocument {
  startDocument(): void;
  endDocument(): void;
  startElement(name: string, attrs: ReadonlyArray<[string, string]>): void;
  endElement(name: string): void;
  characters(text: string): void;
  cdataBlock(text: string): void;
  error(message: string): void;
}

interface SaxParser {
  parse(data: string): void;
}

interface NokogiriModule {
  SaxDocument: new () => SaxDocument;
  SAX: { Parser: new (handler: SaxDocument) => SaxParser };
}

// Loaded via a non-literal specifier so the optional dependency does not have
// to resolve at type-check time; the cast pins it to the surface above.
const NOKOGIRI_PACKAGE = "@blazetrails/nokogiri";

async function loadNokogiri(): Promise<NokogiriModule> {
  try {
    return (await import(NOKOGIRI_PACKAGE)) as unknown as NokogiriModule;
  } catch (e) {
    if (isModuleNotFound(e, "@blazetrails/nokogiri")) {
      throw new Error(
        "@blazetrails/nokogiri is not installed. Add it as a dependency to use the Nokogiri SAX backend.",
        { cause: e },
      );
    }
    throw e;
  }
}

export async function parse(data: string | null | undefined): Promise<XmlHash> {
  if (!data) return {};
  const { SAX, SaxDocument } = await loadNokogiri();

  class HashBuilder extends SaxDocument {
    // Outer wrapper hash; start_document initialises it and pushes it as the stack base.
    hash: XmlHash = {};
    private _hashStack: XmlHash[] = [];

    get currentHash(): XmlHash {
      return this._hashStack[this._hashStack.length - 1];
    }

    override startDocument(): void {
      this.hash = {};
      this._hashStack = [this.hash];
    }

    override endDocument(): void {
      if (this._hashStack.length > 1) {
        throw new Error("Parse stack not empty!");
      }
    }

    override error(message: string): void {
      throw new Error(message);
    }

    override startElement(name: string, attrs: ReadonlyArray<[string, string]>): void {
      const newHash: XmlHash = { [CONTENT_KEY]: "" };
      for (const [k, v] of attrs) newHash[k] = v;
      // Store initial hash size before adding the size sentinel (mirrors Rails new_hash.size + 1).
      newHash[HASH_SIZE_KEY] = Object.keys(newHash).length + 1;

      const parent = this.currentHash;
      if (Object.prototype.hasOwnProperty.call(parent, name)) {
        const existing = parent[name];
        if (Array.isArray(existing)) {
          (existing as XmlHash[]).push(newHash);
        } else {
          parent[name] = [existing, newHash];
        }
      } else {
        parent[name] = newHash;
      }

      this._hashStack.push(newHash);
    }

    override endElement(_name: string): void {
      const current = this._hashStack.pop()!;
      const initialSize = current[HASH_SIZE_KEY] as number;
      delete current[HASH_SIZE_KEY];
      const content = current[CONTENT_KEY] as string | undefined;
      // Strip __content__ if blank and children were added, or if still the empty initial value.
      if (
        (Object.keys(current).length > initialSize - 1 && (!content || content.trim() === "")) ||
        content === ""
      ) {
        delete current[CONTENT_KEY];
      }
    }

    override characters(text: string): void {
      const current = this.currentHash;
      current[CONTENT_KEY] = ((current[CONTENT_KEY] as string | undefined) ?? "") + text;
    }

    override cdataBlock(text: string): void {
      this.characters(text);
    }
  }

  const builder = new HashBuilder();
  new SAX.Parser(builder).parse(data);
  return builder.hash;
}
