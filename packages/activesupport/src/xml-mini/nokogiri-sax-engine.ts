import { SAX, SaxDocument } from "@blazetrails/nokogiri";

const CONTENT_ROOT = "__content__";

type XmlHash = Record<string, unknown>;

class NokogiriSaxHandler extends SaxDocument {
  private readonly _stack: Array<{ name: string; hash: XmlHash }> = [];
  private readonly _errors: string[] = [];
  result: XmlHash = {};

  override startElement(name: string, attrs: ReadonlyArray<[string, string]>): void {
    const hash: XmlHash = {};
    for (const [k, v] of attrs) {
      hash[k] = v;
    }
    this._stack.push({ name, hash });
  }

  override endElement(_name: string): void {
    const frame = this._stack.pop()!;
    if (this._stack.length === 0) {
      this.result = { [frame.name]: frame.hash };
    } else {
      const parent = this._stack[this._stack.length - 1];
      const key = frame.name;
      if (Object.prototype.hasOwnProperty.call(parent.hash, key)) {
        const existing = parent.hash[key];
        if (Array.isArray(existing)) {
          existing.push(frame.hash);
        } else {
          parent.hash[key] = [existing, frame.hash];
        }
      } else {
        parent.hash[key] = frame.hash;
      }
    }
  }

  override characters(text: string): void {
    this._appendContent(text);
  }

  override cdataBlock(text: string): void {
    this._appendContent(text);
  }

  override error(message: string): void {
    this._errors.push(message);
  }

  get parseErrors(): ReadonlyArray<string> {
    return this._errors;
  }

  private _appendContent(text: string): void {
    const frame = this._stack[this._stack.length - 1];
    if (!frame) return;
    const existing = frame.hash[CONTENT_ROOT];
    frame.hash[CONTENT_ROOT] = typeof existing === "string" ? existing + text : text;
  }
}

export function parseXmlToHashSax(data: string): XmlHash {
  const handler = new NokogiriSaxHandler();
  new SAX.Parser(handler).parse(data);
  if (handler.parseErrors.length > 0) {
    throw new Error(handler.parseErrors[0]);
  }
  return handler.result;
}

export { SAX };
