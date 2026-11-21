import { StringIO, warn } from "@blazetrails/ruby-compat";
import { isBlank } from "../core-ext/object/blank.js";

const CONTENT_ROOT = "__content__";

let Nokogiri: typeof import("@blazetrails/nokogiri");
try {
  Nokogiri = await import("@blazetrails/nokogiri");
} catch (e) {
  warn(
    "You don't have nokogiri installed in your application. Please add it to your Gemfile and run bundle install",
  );
  throw e;
}

type XmlHash = Record<string, unknown>;

interface XmlAttr {
  nodeName: string;
  value: string;
}

interface XmlNode {
  readonly name: string;
  readonly content: string;
  readonly children: XmlNode[];
  readonly attributeNodes: XmlAttr[];
  isElement(): boolean;
  isText(): boolean;
  isCdata(): boolean;
}

function toHash(node: XmlNode | { root: XmlNode }, hash: XmlHash = {}): XmlHash {
  if ("root" in node) return toHash(node.root);

  const nodeHash: XmlHash = {};

  const existing = hash[node.name];
  if (Array.isArray(existing)) {
    existing.push(nodeHash);
  } else if (existing != null) {
    hash[node.name] = [existing, nodeHash];
  } else {
    hash[node.name] = nodeHash;
  }

  for (const c of node.children) {
    if (c.isElement()) {
      toHash(c, nodeHash);
    } else if (c.isText() || c.isCdata()) {
      nodeHash[CONTENT_ROOT] ??= "";
      nodeHash[CONTENT_ROOT] += c.content;
    }
  }

  if (Object.keys(nodeHash).length > 1 && isBlank(nodeHash[CONTENT_ROOT])) {
    delete nodeHash[CONTENT_ROOT];
  }

  for (const a of node.attributeNodes) nodeHash[a.nodeName] = a.value;

  return hash;
}

export function parse(data: string | StringIO | null | undefined): XmlHash {
  if (!(data instanceof StringIO)) {
    data = new StringIO(data ?? "");
  }

  if (data.isEof()) {
    return {};
  } else {
    const doc = Nokogiri.parseXml(data);
    try {
      if (doc.errors.length > 0) {
        throw doc.errors[0];
      }
      return toHash(doc);
    } finally {
      doc.dispose();
    }
  }
}
