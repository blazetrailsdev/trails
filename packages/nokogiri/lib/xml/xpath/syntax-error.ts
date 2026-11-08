import { constSet } from "@blazetrails/ruby-compat";
import { XPath } from "../../namespaces.js";
export class SyntaxError extends Error {
  override name = "Nokogiri::XML::XPath::SyntaxError";
}

constSet(XPath, "SyntaxError", SyntaxError);
