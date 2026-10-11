/**
 * ESLint rule: inlined-from-only-on-constructors (RFC 0188)
 *
 * `@inlinedFrom` names the Ruby body a segment of a constructor came from when
 * that body lives in another Ruby file. arel's `inlined-from` bucket pins the
 * general case, a module member whose body sits on an including class's file,
 * at 0, and this tag must not become a way to admit it. So the tag is valid
 * only on a class constructor, only for a hook in {@link HOOKS}, and only as
 * `<Ruby::Name>#<hook> <source>/<version>/<file>.rb:<first>-<last>`.
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

const kebab = (rubyPath) => rubyPath.replaceAll("_", "-");

/**
 * Whether `filename` is the file that mirrors the cited `.rb`:
 * `activemodel/lib/active_model/api.rb` is `packages/activemodel/src/api.ts`,
 * and `actionpack/lib/action_controller/metal.rb` keeps its namespace
 * directory as `packages/actionpack/src/action-controller/metal.ts`.
 */
function mirrorsCitedFile(filename, rubyPath) {
  const ts = /(?:^|\/)packages\/([^/]+)\/src\/(.+)\.ts$/.exec(filename.replaceAll("\\", "/"));
  const rb = /^([^/]+)\/lib\/(.+)$/.exec(rubyPath);
  if (ts === null || rb === null || ts[1] !== rb[1]) return false;
  const cited = kebab(rb[2]);
  return cited === ts[2] || cited.slice(cited.indexOf("/") + 1) === ts[2];
}

function isConstructor(sourceCode, comment) {
  const token = sourceCode.getTokenAfter(comment, { includeComments: false });
  if (token === null) return false;
  let node = sourceCode.getNodeByRangeIndex(token.range[0]);
  while (node?.parent && node.parent.range[0] === token.range[0]) node = node.parent;
  return node?.type === "MethodDefinition" && node.kind === "constructor";
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow `@inlinedFrom` only on a class constructor, citing a hook on the closed list.",
    },
    schema: [],
    messages: {
      notConstructor:
        "`@inlinedFrom` is valid only on a class constructor. A module member whose body sits on an including class's file is not admitted by this tag.",
      notOnList:
        "`@inlinedFrom {{name}}` cites no hook on the closed list ({{hooks}}). A class's own `Klass.new` is a direct port to the constructor and takes no tag.",
      malformedCitation:
        "`@inlinedFrom {{name}}` must be followed by one citation, `<source>/<version>/<file>.rb:<first>-<last>`, relative to `vendor/` and not spelling it.",
      trailingProse: "`@inlinedFrom {{name}}` carries nothing after its citation.",
      redundant:
        "`@inlinedFrom {{name}}` cites the Ruby file this constructor's own file mirrors. A same-file body is inlined untagged.",
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
          if (!isConstructor(sourceCode, comment)) {
            report("notConstructor");
            continue;
          }
          for (const tag of tags) {
            const [name = "", citation, ...extra] = tag.text.trim().split(/\s+/u).filter(Boolean);
            if (!HOOKS.some((hook) => hook.name.test(name))) {
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
