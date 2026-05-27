// libxml2-wasm uses top-level await — incompatible with Rollup IIFE format.
const unavailable = (): never => {
  throw new Error("nokogiri not available in service worker");
};
class XmlDocument {
  constructor() {
    unavailable();
  }
  static parse(_data: string): never {
    return unavailable();
  }
}
class XmlNode {
  constructor() {
    unavailable();
  }
}
export class SaxDocument {
  constructor() {
    unavailable();
  }
}
export class SaxParser {
  constructor() {
    unavailable();
  }
}
export const XML = { Document: XmlDocument, Node: XmlNode };
export const SAX = { Document: SaxDocument, Parser: SaxParser };
export function parseXml(_data: string): never {
  return unavailable();
}
