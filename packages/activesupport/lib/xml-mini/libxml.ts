import { StringIO } from "@blazetrails/ruby-compat";
import { LibXML } from "@blazetrails/libxml-ruby";
import { isBlank } from "../core-ext/object/blank.js";

type XmlHash = Record<string, unknown>;
type LibXMLDocument = InstanceType<typeof LibXML.XML.Document>;
type LibXMLNode = InstanceType<typeof LibXML.XML.Node>;

export function parse(data: string | StringIO | null | undefined): XmlHash {
  if (!(data instanceof StringIO)) {
    data = new StringIO(data ?? "");
  }

  if (data.isEof()) {
    return {};
  } else {
    return Document.toHash.call(LibXML.XML.Parser.io(data).parse());
  }
}

export const Document = {
  toHash(this: LibXMLDocument): XmlHash {
    return Node.toHash.call(this.root!);
  },
};

export const Node = {
  CONTENT_ROOT: "__content__",

  toHash(this: LibXMLNode, hash: XmlHash = {}): XmlHash {
    const nodeHash: XmlHash = {};
    const name = this.name!;

    const existing = hash[name];
    if (Array.isArray(existing)) {
      existing.push(nodeHash);
    } else if (typeof existing === "object" && existing !== null) {
      hash[name] = [existing, nodeHash];
    } else if (existing == null) {
      hash[name] = nodeHash;
    }

    this.eachChild((c) => {
      if (c.isElement()) {
        Node.toHash.call(c, nodeHash);
      } else if (c.isText() || c.isCdata()) {
        nodeHash[Node.CONTENT_ROOT] ??= "";
        nodeHash[Node.CONTENT_ROOT] += c.content ?? "";
      }
    });

    if (Object.keys(nodeHash).length > 1 && isBlank(nodeHash[Node.CONTENT_ROOT])) {
      delete nodeHash[Node.CONTENT_ROOT];
    }

    this.eachAttr((a) => {
      nodeHash[a.name] = a.value;
    });

    return hash;
  },
};
