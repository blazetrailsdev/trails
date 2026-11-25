import { StringIO, include, rbObjRespondTo, type Included } from "@blazetrails/ruby-compat";
import type { IO } from "@blazetrails/libxml-ruby";
import { LibXML } from "@blazetrails/libxml-ruby";
import { isBlank } from "../core-ext/object/blank.js";

type XmlHash = Record<string, unknown>;
type ReadableIO = IO & { isEof(): boolean };

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include LibXML::XML::SaxParser::Callbacks` (`libxmlsax.rb:12`); the class/interface merge is how a mixin surfaces on the type side. */
export interface HashBuilder extends Included<typeof LibXML.XML.SaxParser.Callbacks> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class HashBuilder {
  static readonly CONTENT_KEY = "__content__";
  static readonly HASH_SIZE_KEY = "__hash_size__";

  hash: XmlHash = {};
  private _hashStack: XmlHash[] = [];

  get currentHash(): XmlHash {
    return this._hashStack.at(-1)!;
  }

  onStartDocument(): void {
    this.hash = { [HashBuilder.CONTENT_KEY]: "" };
    this._hashStack = [this.hash];
  }

  onEndDocument(): void {
    this.hash = this._hashStack.pop()!;
    delete this.hash[HashBuilder.CONTENT_KEY];
  }

  onStartElement(name: string, attrs: Record<string, string> = {}): void {
    const newHash: XmlHash = Object.assign({ [HashBuilder.CONTENT_KEY]: "" }, attrs);
    newHash[HashBuilder.HASH_SIZE_KEY] = Object.keys(newHash).length + 1;

    const currentHash = this.currentHash;
    const existing = currentHash[name];
    if (Array.isArray(existing)) {
      existing.push(newHash);
    } else if (typeof existing === "object" && existing !== null) {
      currentHash[name] = [existing, newHash];
    } else if (existing == null) {
      currentHash[name] = newHash;
    }

    this._hashStack.push(newHash);
  }

  onEndElement(_name: string): void {
    const currentHash = this.currentHash;
    const length = Object.keys(currentHash).length;
    const hashSize = currentHash[HashBuilder.HASH_SIZE_KEY] as number;
    delete currentHash[HashBuilder.HASH_SIZE_KEY];
    if (
      (length > hashSize && isBlank(currentHash[HashBuilder.CONTENT_KEY])) ||
      currentHash[HashBuilder.CONTENT_KEY] === ""
    ) {
      delete currentHash[HashBuilder.CONTENT_KEY];
    }
    this._hashStack.pop();
  }

  onCharacters(string: string): void {
    (this.currentHash[HashBuilder.CONTENT_KEY] as string) += string;
  }
}
HashBuilder.prototype.onCdataBlock = HashBuilder.prototype.onCharacters;
include(HashBuilder, LibXML.XML.SaxParser.Callbacks);

let _documentClass: new () => HashBuilder = HashBuilder;

export function documentClass(): new () => HashBuilder {
  return _documentClass;
}

export function setDocumentClass(klass: new () => HashBuilder): void {
  _documentClass = klass;
}

export function parse(data: string | ReadableIO | null | undefined): XmlHash {
  if (!rbObjRespondTo(data, "read")) {
    data = new StringIO((data as string | null | undefined) ?? "");
  }

  if ((data as ReadableIO).isEof()) {
    return {};
  } else {
    LibXML.XML.Error.setHandler(LibXML.XML.Error.QUIET_HANDLER);
    const parser = LibXML.XML.SaxParser.io(data as ReadableIO);
    const document = new (documentClass())();

    parser.callbacks = document;
    parser.parse();
    return document.hash;
  }
}
