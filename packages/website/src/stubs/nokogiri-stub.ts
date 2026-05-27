// Stub for @blazetrails/nokogiri used only by the SW (IIFE) build.
// libxml2-wasm uses top-level await, which Rollup cannot bundle into IIFE
// format. The SW never exercises XML parsing — it routes Rack requests but
// never runs integration-test assertions — so dead-code stubs suffice.
export const XML = { Document: null as never, Node: null as never };
export const SAX = { Document: null as never, Parser: null as never };
export function parseXml(): never {
  throw new Error("nokogiri not available in service worker");
}
export class SaxDocument {}
export class SaxParser {}
