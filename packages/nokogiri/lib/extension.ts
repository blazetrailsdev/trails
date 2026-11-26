import * as libxml2 from "libxml2-wasm";
import {
  error,
  xmlAddChild,
  xmlCtxtSetErrorHandler,
  xmlFreeParserCtxt,
  xmlNewDoc,
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
