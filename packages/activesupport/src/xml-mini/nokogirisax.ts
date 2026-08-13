import { isBlank } from "../string-utils.js";

function isModuleNotFound(e: unknown, pkg: string): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return code === "ERR_MODULE_NOT_FOUND" && e.message.includes(pkg);
}

type XmlHash = Record<string, unknown>;

// @blazetrails/nokogiri is an optional peer dependency, so it may not be
// resolvable when this file is type-checked in isolation (e.g. before its
// `dist` is built). These local interfaces describe the slice of the Nokogiri
// SAX surface used below so the dynamic import stays well-typed without
// depending on the package's own declarations being present.
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

/**
 * Class that will build the hash while the XML document
 * is being parsed using SAX events.
 *
 * Rails' `HashBuilder < Nokogiri::XML::SAX::Document`; the base class lives in
 * the optional `@blazetrails/nokogiri` dependency, which can only be reached
 * through a dynamic `import()`, and a module-level `extends` on it would need a
 * top-level await (which breaks the IIFE/CJS bundles). Nokogiri's SAX document
 * base is a bag of no-op callbacks and the parser dispatches structurally, so
 * declaring the same callbacks here is the same class without the load-order
 * dependency.
 */
export class HashBuilder {
  static readonly CONTENT_KEY = "__content__";
  static readonly HASH_SIZE_KEY = "__hash_size__";

  hash: XmlHash = {};
  private _hashStack: XmlHash[] = [];

  get currentHash(): XmlHash {
    return this._hashStack[this._hashStack.length - 1];
  }

  startDocument(): void {
    this.hash = {};
    this._hashStack = [this.hash];
  }

  endDocument(): void {
    if (this._hashStack.length > 1) {
      throw new Error("Parse stack not empty!");
    }
  }

  error(errorMessage: string): void {
    throw new Error(errorMessage);
  }

  startElement(name: string, attrs: ReadonlyArray<[string, string]> = []): void {
    const newHash: XmlHash = { [HashBuilder.CONTENT_KEY]: "" };
    for (const [k, v] of attrs) newHash[k] = v;
    newHash[HashBuilder.HASH_SIZE_KEY] = Object.keys(newHash).length + 1;

    const currentHash = this.currentHash;
    const existing = currentHash[name];
    if (Array.isArray(existing)) {
      (existing as XmlHash[]).push(newHash);
    } else if (typeof existing === "object" && existing !== null) {
      currentHash[name] = [existing, newHash];
    } else if (existing == null) {
      currentHash[name] = newHash;
    }

    this._hashStack.push(newHash);
  }

  endElement(_name: string): void {
    const currentHash = this.currentHash;
    const length = Object.keys(currentHash).length;
    const hashSize = currentHash[HashBuilder.HASH_SIZE_KEY] as number;
    delete currentHash[HashBuilder.HASH_SIZE_KEY];
    const content = currentHash[HashBuilder.CONTENT_KEY];
    if ((length > hashSize && isBlank(content)) || content === "") {
      delete currentHash[HashBuilder.CONTENT_KEY];
    }
    this._hashStack.pop();
  }

  characters(string: string): void {
    const currentHash = this.currentHash;
    currentHash[HashBuilder.CONTENT_KEY] =
      ((currentHash[HashBuilder.CONTENT_KEY] as string | undefined) ?? "") + string;
  }

  cdataBlock(string: string): void {
    this.characters(string);
  }
}

let _documentClass: new () => HashBuilder = HashBuilder;

/** Mirrors `attr_accessor :document_class` (nokogirisax.rb:66-67). */
export function documentClass(): new () => HashBuilder {
  return _documentClass;
}

export function setDocumentClass(klass: new () => HashBuilder): void {
  _documentClass = klass;
}

/**
 * Mirrors: ActiveSupport::XmlMini_NokogiriSAX#parse (nokogirisax.rb:69-80) —
 * `Blob` is the platform's in-memory readable byte container, so it stands in
 * for the `StringIO` Rails wraps a non-readable `data` in (the same stand-in
 * `XmlMini._parse_file` makes), and `instanceof Blob` for `respond_to?(:read)`.
 * Reading the blob out is the `eof?` test: an empty read is Ruby's `eof?`.
 */
export async function parse(data: string | Blob | null | undefined): Promise<XmlHash> {
  if (!(data instanceof Blob)) {
    data = new Blob([data ?? ""]);
  }

  const text = await data.text();
  if (text.length === 0) return {};

  const { SAX } = await loadNokogiri();

  const document = new (documentClass())();
  const parser = new SAX.Parser(document);
  parser.parse(text);
  return document.hash;
}
