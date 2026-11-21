import { SAX } from "@blazetrails/nokogiri";
import { isBlank } from "../string-utils.js";
import { StringIO } from "@blazetrails/ruby-compat";
import { RuntimeError } from "../rexml/document.js";

type XmlHash = Record<string, unknown>;

export class HashBuilder extends SAX.Document {
  static readonly CONTENT_KEY = "__content__";
  static readonly HASH_SIZE_KEY = "__hash_size__";

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
      throw new RuntimeError("Parse stack not empty!");
    }
  }

  override error(errorMessage: string): void {
    throw new RuntimeError(errorMessage);
  }

  override startElement(name: string, attrs: ReadonlyArray<[string, string]> = []): void {
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

  override endElement(_name: string): void {
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

  override characters(string: string): void {
    const currentHash = this.currentHash;
    currentHash[HashBuilder.CONTENT_KEY] =
      ((currentHash[HashBuilder.CONTENT_KEY] as string | undefined) ?? "") + string;
  }

  override cdataBlock(string: string): void {
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
    const parser = new SAX.Parser(document);
    parser.parse(data);
    return document.hash;
  }
}
