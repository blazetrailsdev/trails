import * as libxml2 from "libxml2-wasm";
import {
  error,
  xmlAddChild,
  xmlCtxtSetErrorHandler,
  xmlFreeParserCtxt,
  xmlNewParserCtxt,
  xmlReadString,
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
  xmlUnlinkNode,
} as LibXml2;
