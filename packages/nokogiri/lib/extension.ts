import * as libxml2 from "libxml2-wasm";
import {
  allocCStringArray,
  error,
  free,
  xmlAddChild,
  xmlCtxtSetErrorHandler,
  xmlFreeParserCtxt,
  xmlNewDoc as _xmlNewDoc,
  xmlNewParserCtxt,
  xmlReadString,
  XmlTreeCommonStruct,
  xmlSaveClose,
  xmlSaveSetIndentString,
  xmlSaveToIO,
  xmlSaveTree,
  xmlUnlinkNode,
} from "libxml2-wasm/lib/libxml2.mjs";
import { createNode } from "libxml2-wasm/lib/nodes.mjs";
import { Nokogiri, type LibXml2 } from "./namespaces.js";

declare module "libxml2-wasm/lib/nodes.mjs" {
  export function createNode(nodePtr: number): XmlNode;
}

function xmlNewDoc(version: string): number {
  const buf = allocCStringArray([version]);
  try {
    return (_xmlNewDoc as unknown as (version: number) => number)(buf + 8);
  } finally {
    free(buf);
  }
}

Nokogiri.LibXml2 = {
  ...libxml2,
  error,
  xmlAddChild,
  xmlCtxtSetErrorHandler,
  xmlFreeParserCtxt,
  createNode,
  xmlNewDoc,
  xmlNewParserCtxt,
  xmlReadString,
  XmlTreeCommonStruct,
  xmlSaveClose,
  xmlSaveSetIndentString,
  xmlSaveToIO,
  xmlSaveTree,
  xmlUnlinkNode,
} as LibXml2;
