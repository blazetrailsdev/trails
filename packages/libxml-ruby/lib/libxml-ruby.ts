import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Attr } from "./attr.js";
import { Attributes } from "./attributes.js";
import { Document } from "./document.js";
import { Error } from "./error.js";
import { Node } from "./node.js";
import { Parser } from "./parser.js";
import { SaxParser } from "./sax-parser.js";

export const XML = { Attr, Attributes, Document, Error, Node, Parser, SaxParser };

export const LibXML = { XML };
constSet(TopLevel, "LibXML", LibXML);

import "./constants.generated.js";

export { Attr, Attributes, Document, Error, Node, Parser, SaxParser };
export type { SaxCallbacks } from "./sax-callbacks.js";
export type { IO } from "./parser/context.js";
