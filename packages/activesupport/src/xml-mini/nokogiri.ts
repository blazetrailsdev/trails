import { StringIO } from "@blazetrails/ruby-compat";

const CONTENT_ROOT = "__content__";

function isModuleNotFound(e: unknown, pkg: string): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return code === "ERR_MODULE_NOT_FOUND" && e.message.includes(pkg);
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

interface XmlDocument {
  readonly errors: ReadonlyArray<Error>;
  readonly root: XmlNode;
  dispose(): void;
}

interface NokogiriModule {
  parseXml(data: string | StringIO): XmlDocument;
}

const NOKOGIRI_PACKAGE = "@blazetrails/nokogiri";

let nokogiri: NokogiriModule | undefined;

/** @internal */
export async function _require(): Promise<void> {
  if (nokogiri !== undefined) return;
  try {
    nokogiri = (await import(NOKOGIRI_PACKAGE)) as unknown as NokogiriModule;
  } catch (e) {
    if (isModuleNotFound(e, "@blazetrails/nokogiri")) {
      throw new Error(
        "@blazetrails/nokogiri is not installed. Add it as a dependency to use the Nokogiri XML backend.",
        { cause: e },
      );
    }
    throw e;
  }
}

function nodeToHash(node: XmlNode): XmlHash {
  const hash: XmlHash = {};

  for (const child of node.children) {
    if (child.isElement()) {
      const childHash = nodeToHash(child);
      const key = child.name;
      if (Object.prototype.hasOwnProperty.call(hash, key)) {
        const existing = hash[key];
        if (Array.isArray(existing)) {
          existing.push(childHash);
        } else {
          hash[key] = [existing, childHash];
        }
      } else {
        hash[key] = childHash;
      }
    } else if (child.isText() || child.isCdata()) {
      const existing = hash[CONTENT_ROOT];
      hash[CONTENT_ROOT] = typeof existing === "string" ? existing + child.content : child.content;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(hash, CONTENT_ROOT) &&
    Object.keys(hash).length > 1 &&
    (hash[CONTENT_ROOT] as string).trim() === ""
  ) {
    delete hash[CONTENT_ROOT];
  }

  for (const attr of node.attributeNodes) {
    hash[attr.nodeName] = attr.value;
  }

  return hash;
}

/** @missingRailsCall first — PERMANENT */
export function parse(data: string | StringIO | null | undefined): XmlHash {
  if (!(data instanceof StringIO)) {
    data = new StringIO(data ?? "");
  }

  if (data.isEof()) {
    return {};
  } else {
    const doc = nokogiri!.parseXml(data);
    try {
      if (doc.errors.length > 0) {
        throw doc.errors[0];
      }
      return { [doc.root.name]: nodeToHash(doc.root) };
    } finally {
      doc.dispose();
    }
  }
}
