import { isBlank } from "../string-utils.js";
import { StringIO } from "@blazetrails/ruby-compat";
import { RuntimeError } from "../rexml/document.js";

function isModuleNotFound(e: unknown, pkg: string): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return code === "ERR_MODULE_NOT_FOUND" && e.message.includes(pkg);
}

type XmlHash = Record<string, unknown>;

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
  parse(data: string | StringIO): void;
}

interface NokogiriModule {
  SAX: { Parser: new (handler: SaxDocument) => SaxParser };
}

const NOKOGIRI_PACKAGE = "@blazetrails/nokogiri";

let nokogiri: NokogiriModule | undefined;

/** @internal */
export async function _require(): Promise<void> {
  if (nokogiri !== undefined) return;
  try {
    nokogiri = (await import(NOKOGIRI_PACKAGE)) as unknown as NokogiriModule;
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

export class HashBuilder {
  static readonly CONTENT_KEY = "__content__";
  static readonly HASH_SIZE_KEY = "__hash_size__";

  hash: XmlHash = {};
  private _hashStack: XmlHash[] = [];

  /** @missingRailsCall last — PERMANENT */
  get currentHash(): XmlHash {
    return this._hashStack[this._hashStack.length - 1];
  }

  startDocument(): void {
    this.hash = {};
    this._hashStack = [this.hash];
  }

  endDocument(): void {
    if (this._hashStack.length > 1) {
      throw new RuntimeError("Parse stack not empty!");
    }
  }

  error(errorMessage: string): void {
    throw new RuntimeError(errorMessage);
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

  /** @missingRailsCall delete — PERMANENT */
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

export function documentClass(): new () => HashBuilder {
  return _documentClass;
}

export function setDocumentClass(klass: new () => HashBuilder): void {
  _documentClass = klass;
}

export function parse(data: string | StringIO | null | undefined): XmlHash {
  if (!(data instanceof StringIO)) {
    data = new StringIO(data ?? "");
  }

  if (data.isEof()) {
    return {};
  } else {
    const document = new (documentClass())();
    const parser = new nokogiri!.SAX.Parser(document);
    parser.parse(data);
    return document.hash;
  }
}
