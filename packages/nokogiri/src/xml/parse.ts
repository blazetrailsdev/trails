import { XmlDocument } from "./document.js";
import { type Readable } from "../readable.js";

export function parseXml(data: string | Readable): XmlDocument {
  return XmlDocument.parse(data);
}
