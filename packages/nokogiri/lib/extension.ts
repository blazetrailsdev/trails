import * as libxml2 from "libxml2-wasm";
import {
  allocCStringArray,
  error,
  free,
  xmlAddChild,
  xmlCtxtSetErrorHandler,
  xmlDocGetRootElement,
  xmlFreeParserCtxt,
  xmlNewCDataBlock,
  xmlNewDoc as _xmlNewDoc,
  xmlNewDocComment,
  xmlNewDocNode,
  xmlNewDocText,
  xmlNewNs,
  XmlNodeStruct,
  xmlNodeSetContent,
  XmlNsStruct,
  xmlNewParserCtxt,
  xmlReadString,
  XmlTreeCommonStruct,
  xmlSaveClose,
  xmlSaveSetIndentString,
  xmlSaveToIO,
  xmlSaveTree,
  xmlSearchNs,
  xmlSetNs,
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
  xmlDocGetRootElement,
  xmlFreeParserCtxt,
  createNode,
  xmlNewCDataBlock,
  xmlNewDoc,
  xmlNewDocComment,
  xmlNewDocNode,
  xmlNewDocText,
  xmlNewNs,
  XmlNodeStruct,
  xmlNodeSetContent,
  XmlNsStruct,
  xmlNewParserCtxt,
  xmlReadString,
  XmlTreeCommonStruct,
  xmlSaveClose,
  xmlSaveSetIndentString,
  xmlSaveToIO,
  xmlSaveTree,
  xmlSearchNs,
  xmlSetNs,
  xmlUnlinkNode,
} as LibXml2;
