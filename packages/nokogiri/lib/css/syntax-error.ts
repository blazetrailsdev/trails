import { constSet } from "@blazetrails/ruby-compat";
import { CSS } from "../namespaces.js";
export class SyntaxError extends Error {
  override name = "Nokogiri::CSS::SyntaxError";
}

constSet(CSS, "SyntaxError", SyntaxError);
