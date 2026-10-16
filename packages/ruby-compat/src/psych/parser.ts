import type * as Yaml from "yaml";
import { IO } from "../io.js";
import { yaml as backend } from "../psych-adapter.js";
import { Handler } from "./handler.js";
import { SyntaxError } from "./syntax-error.js";

const yaml = backend as unknown as typeof Yaml;

const SCALAR_STYLES: Record<string, number> = {
  PLAIN: 1,
  QUOTE_SINGLE: 2,
  QUOTE_DOUBLE: 3,
  BLOCK_LITERAL: 4,
  BLOCK_FOLDED: 5,
};
const DEFAULT_TAG_DIRECTIVES: Record<string, string> = { "!": "!", "!!": "tag:yaml.org,2002:" };

/**
 * `Psych::Parser` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/parser.rb:33`). The libyaml
 * event loop `psych_parser.c` runs is driven here off the backend's composed
 * documents.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Parser {
  /** `YAML_ANY_ENCODING` (`vendor/ruby/v3.3.11/ext/psych/psych_parser.c:534`). @noRailsEquivalent PERMANENT */
  static readonly ANY = 0;
  /** @noRailsEquivalent PERMANENT */
  static readonly UTF8 = 1;
  /** @noRailsEquivalent PERMANENT */
  static readonly UTF16LE = 2;
  /** @noRailsEquivalent PERMANENT */
  static readonly UTF16BE = 3;

  /** @noRailsEquivalent PERMANENT */
  handler: Handler;
  /** @noRailsEquivalent PERMANENT */
  externalEncoding: number;

  /** @noRailsEquivalent PERMANENT */
  constructor(handler: Handler = new Handler()) {
    this.handler = handler;
    this.externalEncoding = Parser.ANY;
  }

  /**
   * `Psych::Parser#parse` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/parser.rb:63-65`).
   *
   * @noRailsEquivalent PERMANENT
   */
  parse(yaml: string | Uint8Array | IO, path: string | null = "<unknown>"): this {
    return this._nativeParse(this.handler, yaml, path);
  }

  /**
   * `parse` (`vendor/ruby/v3.3.11/ext/psych/psych_parser.c:244-520`). libyaml reads the
   * source's bytes (`yaml_parser_set_input_string`, `:271`), so a source held as
   * its bytes is decoded here. A malformed document raises `Psych::SyntaxError`
   * as `make_exception` does (`:80-100`).
   */
  private _nativeParse(
    handler: Handler,
    yamlSource: string | Uint8Array | IO,
    path: string | null,
  ): this {
    if (yamlSource instanceof IO) yamlSource = yamlSource.read();
    if (yamlSource instanceof Uint8Array) yamlSource = new TextDecoder().decode(yamlSource);
    const parsed = yaml.parseAllDocuments(yamlSource);
    const docs = Array.isArray(parsed) ? parsed : [];
    handler.startStream(Parser.UTF8);
    for (const doc of docs) {
      const root = doc.contents;
      const end = root?.range?.[1] ?? 0;
      const closed =
        root != null && yaml.isCollection(root) && root.flow
          ? "}]".includes(yamlSource[end - 1] ?? "")
          : yaml.isScalar(root) && (root.type === "QUOTE_SINGLE" || root.type === "QUOTE_DOUBLE");
      const errors = closed ? doc.errors.filter((e) => e.pos[0] < end) : doc.errors;
      if (errors.length > 0) {
        const [error] = errors;
        const mark = error.linePos?.[0] ?? { line: 0, col: 0 };
        throw new SyntaxError(
          path,
          mark.line,
          mark.col,
          error.pos[0],
          error.message.split(" at line ")[0],
          null,
        );
      }
      const { directives } = doc;
      const version = directives.yaml.explicit
        ? directives.yaml.version.split(".").map(Number)
        : [];
      const tagDirectives = Object.entries(directives.tags).filter(
        ([handle, prefix]) => DEFAULT_TAG_DIRECTIVES[handle] !== prefix,
      );
      handler.startDocument(version, tagDirectives, !directives.docStart);
      this.emitNode(handler, doc.contents);
      handler.endDocument(!directives.docEnd);
    }
    handler.endStream();
    return this;
  }

  private emitNode(handler: Handler, node: unknown): void {
    if (yaml.isAlias(node)) {
      handler.alias(node.source);
    } else if (yaml.isScalar(node)) {
      const tag = node.tag ?? null;
      const style = SCALAR_STYLES[node.type ?? "PLAIN"];
      const value = String((node as { source?: unknown }).source ?? node.value ?? "");
      handler.scalar(
        value,
        node.anchor ?? null,
        tag,
        !tag && style === 1,
        !tag && style !== 1,
        style,
      );
    } else if (yaml.isSeq(node)) {
      handler.startSequence(node.anchor ?? null, node.tag ?? null, !node.tag, node.flow ? 2 : 1);
      for (const item of node.items) this.emitNode(handler, item);
      handler.endSequence();
    } else if (yaml.isMap(node)) {
      handler.startMapping(node.anchor ?? null, node.tag ?? null, !node.tag, node.flow ? 2 : 1);
      for (const pair of node.items) this.emitPair(handler, pair);
      handler.endMapping();
    } else if (yaml.isPair(node)) {
      handler.startMapping(null, null, true, 2);
      this.emitPair(handler, node);
      handler.endMapping();
    } else {
      handler.scalar("", null, null, true, false, 1);
    }
  }

  private emitPair(handler: Handler, pair: Yaml.Pair): void {
    this.emitNode(handler, pair.key);
    this.emitNode(handler, pair.value);
  }
}
