import { CSS } from "../namespaces.js";
export class SyntaxError extends Error {
  override name = "Nokogiri::CSS::SyntaxError";
}

CSS.SyntaxError = SyntaxError;
