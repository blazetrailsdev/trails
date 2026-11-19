import * as libxml2 from "libxml2-wasm";
import { xmlAddChild, xmlUnlinkNode } from "libxml2-wasm/lib/libxml2.mjs";
import { Nokogiri } from "./namespaces.js";

Nokogiri.LibXml2 = { ...libxml2, xmlAddChild, xmlUnlinkNode };
