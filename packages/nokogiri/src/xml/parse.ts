import { XmlDocument } from "./document.js";

export function parseXml(data: string): XmlDocument {
  return XmlDocument.parse(data);
}
