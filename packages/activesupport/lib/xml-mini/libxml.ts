import { include } from "@blazetrails/ruby-compat/include";
import { rbObjRespondTo } from "@blazetrails/ruby-compat/object";
import { StringIO } from "@blazetrails/ruby-compat/string-io";
import { LibXML } from "@blazetrails/libxml-ruby";
import type { IO } from "@blazetrails/libxml-ruby";
import { isBlank } from "../core-ext/object/blank.js";

type XmlHash = Record<string, unknown>;
type ReadableIO = IO & { isEof(): boolean };

export function parse(data: string | ReadableIO | null | undefined): XmlHash {
  if (!rbObjRespondTo(data, "read")) {
    data = new StringIO((data as string | null | undefined) ?? "");
  }

  if ((data as ReadableIO).isEof()) {
    return {};
  } else {
    return LibXML.XML.Parser.io(data as ReadableIO)
      .parse()
      .toHash();
  }
}

export const Conversions = {
  Document: {
    toHash(this: InstanceType<typeof LibXML.XML.Document>): XmlHash {
      return this.root!.toHash();
    },
  },

  Node: {
    CONTENT_ROOT: "__content__",

    toHash(this: InstanceType<typeof LibXML.XML.Node>, hash: XmlHash = {}): XmlHash {
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
          c.toHash(nodeHash);
        } else if (c.isText() || c.isCdata()) {
          nodeHash[Conversions.Node.CONTENT_ROOT] ??= "";
          nodeHash[Conversions.Node.CONTENT_ROOT] += c.content ?? "";
        }
      });

      if (Object.keys(nodeHash).length > 1 && isBlank(nodeHash[Conversions.Node.CONTENT_ROOT])) {
        delete nodeHash[Conversions.Node.CONTENT_ROOT];
      }

      this.eachAttr((a) => {
        nodeHash[a.name] = a.value;
      });

      return hash;
    },
  },
};

declare module "@blazetrails/libxml-ruby" {
  interface Document {
    toHash(): XmlHash;
  }
  interface Node {
    toHash(hash?: XmlHash): XmlHash;
  }
}

include(LibXML.XML.Document, Conversions.Document);
include(LibXML.XML.Node, Conversions.Node);
