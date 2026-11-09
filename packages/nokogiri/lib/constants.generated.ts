import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./css/node.js";
import * as m1 from "./css/parser.js";
import * as m2 from "./css/selector-cache.js";
import * as m3 from "./css/syntax-error.js";
import * as m4 from "./css/tokenizer.js";
import * as m5 from "./css/xpath-visitor.js";
import * as m6 from "./html5/document-fragment.js";
import * as m7 from "./html5/document.js";
import * as m8 from "./html5/node.js";
import * as m9 from "./racc/parser.js";
import * as m10 from "./xml/attr.js";
import * as m11 from "./xml/document-fragment.js";
import * as m12 from "./xml/document.js";
import * as m13 from "./xml/namespace.js";
import * as m14 from "./xml/node-set.js";
import * as m15 from "./xml/node.js";
import * as m16 from "./xml/parse-options.js";
import * as m17 from "./xml/sax/document.js";
import * as m18 from "./xml/sax/parser.js";
import * as m19 from "./xml/syntax-error.js";
import * as m20 from "./xml/xpath-context.js";
import * as m21 from "./xml/xpath/syntax-error.js";

defineConstants([
  [() => m0.Node, "Nokogiri::CSS::Node"],
  [() => m1.Parser, "Nokogiri::CSS::Parser"],
  [() => m2.SelectorCache, "Nokogiri::CSS::SelectorCache"],
  [() => m3.SyntaxError, "Nokogiri::CSS::SyntaxError"],
  [() => m4.Tokenizer, "Nokogiri::CSS::Tokenizer"],
  [() => m4.ScanError, "Nokogiri::CSS::Tokenizer::ScanError"],
  [() => m5.XPathVisitor, "Nokogiri::CSS::XPathVisitor"],
  [() => m5.BuiltinsConfig, "Nokogiri::CSS::XPathVisitor::BuiltinsConfig"],
  [() => m5.DoctypeConfig, "Nokogiri::CSS::XPathVisitor::DoctypeConfig"],
  [() => m7.Document, "Nokogiri::HTML5::Document"],
  [() => m6.DocumentFragment, "Nokogiri::HTML5::DocumentFragment"],
  [() => m8.Node, "Nokogiri::HTML5::Node"],
  [() => m10.Attr, "Nokogiri::XML::Attr"],
  [() => m12.XmlDocument, "Nokogiri::XML::Document"],
  [() => m11.DocumentFragment, "Nokogiri::XML::DocumentFragment"],
  [() => m13.Namespace, "Nokogiri::XML::Namespace"],
  [() => m15.XmlNode, "Nokogiri::XML::Node"],
  [() => m14.NodeSet, "Nokogiri::XML::NodeSet"],
  [() => m16.ParseOptions, "Nokogiri::XML::ParseOptions"],
  [() => m17.SaxDocument, "Nokogiri::XML::SAX::Document"],
  [() => m18.SaxParser, "Nokogiri::XML::SAX::Parser"],
  [() => m19.SyntaxError, "Nokogiri::XML::SyntaxError"],
  [() => m21.SyntaxError, "Nokogiri::XML::XPath::SyntaxError"],
  [() => m20.XPathContext, "Nokogiri::XML::XPathContext"],
  [() => m9.ParseError, "Racc::ParseError"],
  [() => m9.Parser, "Racc::Parser"],
]);
