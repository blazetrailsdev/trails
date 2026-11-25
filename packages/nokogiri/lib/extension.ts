import * as libxml2 from "libxml2-wasm";
import {
  error,
  xmlAddChild,
  xmlCtxtSetErrorHandler,
  xmlFreeParserCtxt,
  xmlNewParserCtxt,
  xmlReadString,
  XmlTreeCommonStruct,
  xmlSaveClose,
  xmlSaveSetIndentString,
  xmlSaveToIO,
  xmlSaveTree,
  xmlUnlinkNode,
} from "libxml2-wasm/lib/libxml2.mjs";
import { Nokogiri, type LibXml2 } from "./namespaces.js";

Nokogiri.LibXml2 = {
  ...libxml2,
  error,
  xmlAddChild,
  xmlCtxtSetErrorHandler,
  xmlFreeParserCtxt,
  xmlNewParserCtxt,
  xmlReadString,
  XmlTreeCommonStruct,
  xmlSaveClose,
  xmlSaveSetIndentString,
  xmlSaveToIO,
  xmlSaveTree,
  xmlUnlinkNode,
} as LibXml2;
