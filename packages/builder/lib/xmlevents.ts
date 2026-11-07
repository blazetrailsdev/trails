import { XmlMarkup } from "./xmlmarkup.js";

export interface XmlEventHandler {
  startTag(tag: string, attrs: Record<string, unknown> | null): unknown;
  endTag(tag: string): unknown;
  text(text: string): unknown;
}

export class XmlEvents extends XmlMarkup {
  textBang(text: string): unknown {
    return (this._target as unknown as XmlEventHandler).text(text);
  }

  _startTag(sym: string, attrs: Record<string, unknown> | null, endToo = false): void {
    (this._target as unknown as XmlEventHandler).startTag(sym, attrs);
    if (endToo) this._endTag(sym);
  }

  _endTag(sym: string): void {
    (this._target as unknown as XmlEventHandler).endTag(sym);
  }
}
