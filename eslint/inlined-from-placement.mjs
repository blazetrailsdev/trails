/**
 * ESLint rule: inlined-from-placement (RFC 0188)
 *
 * `@inlinedFrom` names the Ruby body a segment of a constructor came from when
 * that body lives in another Ruby file. arel's `inlined-from` bucket pins the
 * general case, a module member whose body sits on an including class's file,
 * at 0, and this tag must not become a way to admit it. So the tag is valid
 * only on a class constructor, for a hook in {@link HOOKS}, or on a class
 * method that inlines a module method's `super` (RFC 0197), naming that module
 * method at the Ruby spelling of its own name; and only as
 * `<Ruby::Name>#<hook> <source>/<version>/<file>.rb:<first>-<last>`. Whether
 * the module method's Rails body calls `super` is read from the manifest by
 * `pnpm parity:api:inlined`.
 *
 * The redundant-tag arm reads paths alone, so it sees a constructor whose file
 * mirrors the cited `.rb` by the plain snake→kebab rule. `taggedBodies`
 * (scripts/api-compare/inlined-bodies.ts) is the manifest-backed check and
 * also catches a file mapped through `PATH_SEGMENT_ALIASES`.
 *
 * Hard rules: no node:* imports, no process.* references.
 */
import { lineLeadingTag } from "./jsdoc-tag-line.mjs";

const TAG = "inlinedFrom";
const OWNER = "[A-Z]\\w*(?:::[A-Z]\\w*)*";

/**
 * The hooks the tag may cite. A closed list: adding an entry is a reviewed
 * change here. A class's own `Klass.new` is not on it, since that is a direct
 * port to the constructor and is paired with no tag.
 */
export const HOOKS = [
  { spelling: "Module#initialize", name: new RegExp(`^${OWNER}#initialize$`) },
  { spelling: "Mod::ClassMethods#new", name: new RegExp(`^${OWNER}::ClassMethods#new$`) },
];

const CITATION = /^([\w.-]+)\/[\w.-]+\/(\S+)\.rb:\d+-\d+$/;

const MODULE_METHOD = new RegExp(`^${OWNER}#([a-z_]\\w*[?!=]?)$`);

/** The TS spellings of a Ruby method name: `content_tag` is `contentTag`, `valid?` `isValid`. */
function tsSpellings(rubyName) {
  const camel = rubyName.replace(/[?!=]$/, "").replace(/_+([a-z0-9])/g, (_, c) => c.toUpperCase());
  const capital = camel.charAt(0).toUpperCase() + camel.slice(1);
  if (rubyName.endsWith("?")) return [camel, `is${capital}`];
  if (rubyName.endsWith("=")) return [camel, `set${capital}`];
  return [camel];
}

const kebab = (rubyPath) => rubyPath.replaceAll("_", "-");

/**
 * Whether `filename` is the file that mirrors the cited `.rb`:
 * `activemodel/lib/active_model/api.rb` is `packages/activemodel/src/api.ts`,
 * the gem's own namespace directory dropped, and
 * `actionpack/lib/action_controller/metal.rb` keeps a directory that is not
 * the gem's name as `packages/actionpack/src/action-controller/metal.ts`.
 */
function mirrorsCitedFile(filename, rubyPath) {
  const ts = /(?:^|\/)packages\/([^/]+)\/src\/(.+)\.ts$/.exec(filename.replaceAll("\\", "/"));
  const rb = /^([^/]+)\/lib\/(.+)$/.exec(rubyPath);
  if (ts === null || rb === null || ts[1] !== rb[1]) return false;
  const [namespace, ...rest] = kebab(rb[2]).split("/");
  const cited = namespace.replaceAll("-", "") === rb[1] ? rest : [namespace, ...rest];
  return cited.join("/") === ts[2];
}

/** The class member the comment documents: `"constructor"`, a method's name, or null. */
function memberOf(sourceCode, comment) {
  const token = sourceCode.getTokenAfter(comment, { includeComments: false });
  if (token === null) return null;
  let node = sourceCode.getNodeByRangeIndex(token.range[0]);
  while (node?.parent && node.parent.range[0] === token.range[0]) node = node.parent;
  if (node?.type !== "MethodDefinition") return null;
  if (node.kind === "constructor") return "constructor";
  if (node.static) return null;
  return node.key.type === "Identifier" ? node.key.name : null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow `@inlinedFrom` only on a class constructor citing a hook on the closed list, or on a method inlining a module method's `super`.",
    },
    schema: [],
    messages: {
      notConstructor:
        "`@inlinedFrom` is valid only on a class constructor or method. A module member whose body sits on an including class's file is not admitted by this tag.",
      notThisMethod:
        "`@inlinedFrom {{name}}` names a module method other than this one. A method inlines the `super` of the module method it is named after.",
      notOnList:
        "`@inlinedFrom {{name}}` cites no hook on the closed list ({{hooks}}). A class's own `Klass.new` is a direct port to the constructor and takes no tag.",
      malformedCitation:
        "`@inlinedFrom {{name}}` must be followed by one citation, `<source>/<version>/<file>.rb:<first>-<last>`, relative to `vendor/` and not spelling it.",
      trailingProse: "`@inlinedFrom {{name}}` carries nothing after its citation.",
      redundant:
        "`@inlinedFrom {{name}}` cites the Ruby file this member's own file mirrors. A same-file body is inlined untagged.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? context.getFilename?.() ?? "";
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type !== "Block" || !comment.value.startsWith("*")) continue;
          const tags = comment.value
            .split("\n")
            .map(lineLeadingTag)
            .filter((tag) => tag !== null && tag.name === TAG);
          if (tags.length === 0) continue;
          const report = (messageId, data) => context.report({ loc: comment.loc, messageId, data });
          const member = memberOf(sourceCode, comment);
          if (member === null) {
            report("notConstructor");
            continue;
          }
          for (const tag of tags) {
            const [name = "", citation, ...extra] = tag.text.trim().split(/\s+/u).filter(Boolean);
            const method = MODULE_METHOD.exec(name)?.[1];
            if (member !== "constructor") {
              if (method === undefined || method === "initialize" || method === "new") {
                report("notConstructor");
                continue;
              }
              if (!tsSpellings(method).includes(member)) {
                report("notThisMethod", { name });
                continue;
              }
            } else if (!HOOKS.some((hook) => hook.name.test(name))) {
              report("notOnList", { name, hooks: HOOKS.map((hook) => hook.spelling).join(", ") });
              continue;
            }
            const cite = CITATION.exec(citation ?? "");
            if (cite === null || cite[1] === "vendor") {
              report("malformedCitation", { name });
              continue;
            }
            if (extra.length > 0) report("trailingProse", { name });
            if (mirrorsCitedFile(filename, cite[2])) report("redundant", { name });
          }
        }
      },
    };
  },
};

export default rule;
