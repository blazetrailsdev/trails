import ts from "typescript";
import {
  crossFileHits,
  indexPortFile,
  resolvePortFn,
  type GlobalPortIndex,
  type PortIndex,
} from "./score.js";

/**
 * The draft marker. It is deliberately loud and greppable: a scaffolded body is
 * NOT a port — it is a starting point the porting agent finishes under normal
 * test-compare discipline, and no scaffolded body may be committed carrying
 * this line.
 */
export const APPLY_MARKER =
  "// PRISM-CODEGEN DRAFT — machine-scaffolded from the Rails source. Not a port:\n" +
  "// review against vendor/rails, finish it, and delete this marker before committing.";

export interface ApplyRequest {
  generatedCode: string;
  portSource: string;
  portFile: string;
  methodName: string;
  globalIndex?: GlobalPortIndex;
  /** `__PRISM_TODO` passthrough count for this def, from the generator's `perDef` tally. */
  passthrough?: number;
}

export type ApplyPlan =
  | { status: "applied"; source: string; insertedAfter?: string; insertedBefore?: string }
  | { status: "refused"; reason: string };

interface GeneratedDef {
  name: string;
  text: string;
  fn: ts.FunctionLikeDeclaration;
}

function generatedFunctions(generatedCode: string): GeneratedDef[] {
  const sf = ts.createSourceFile(
    "gen.js",
    generatedCode,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  const out: GeneratedDef[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.body
    ) {
      out.push({ name: node.name.text, text: node.getText(sf).trim(), fn: node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * The top-level statement a port symbol belongs to — an arrow initializer's own
 * position points at the arrow, not at the `export const` we have to insert
 * around.
 */
function topLevelStatement(fn: ts.Node): ts.Node {
  let node: ts.Node = fn;
  while (node.parent && !ts.isSourceFile(node.parent)) node = node.parent;
  return node;
}

function localHit(port: PortIndex, def: GeneratedDef): ts.FunctionLikeDeclaration | undefined {
  const resolved = resolvePortFn(def.name, def.fn, port);
  return resolved?.fn;
}

/**
 * Plan a draft insertion. Pure: it returns the would-be port source, never
 * touches disk, and refuses whenever the method already has a home — the whole
 * point of the cross-file resolver is that a method ported into a different
 * file is not duplicated here.
 */
export function planApply(req: ApplyRequest): ApplyPlan {
  const generated = generatedFunctions(req.generatedCode);
  const targetIndex = generated.findIndex((g) => g.name === req.methodName);
  if (targetIndex === -1) {
    return {
      status: "refused",
      reason:
        `no generated def named ${req.methodName} — the scorer only scaffolds clean ` +
        `generated defs, so check \`pnpm codegen:score --verbose\` for the exact name.`,
    };
  }

  if (req.passthrough) {
    return {
      status: "refused",
      reason:
        `${req.methodName} generated with ${req.passthrough} passthrough node(s) — the ` +
        `draft would be riddled with __PRISM_TODO. Port it by hand.`,
    };
  }

  const port = indexPortFile(req.portSource);
  const target = generated[targetIndex];
  if (resolvePortFn(target.name, target.fn, port)) {
    return {
      status: "refused",
      reason: `${req.methodName} is already defined in ${req.portFile}.`,
    };
  }
  const elsewhere = req.globalIndex
    ? [
        ...new Set(crossFileHits(target.name, target.fn, req.globalIndex).map((h) => h.file)),
      ].filter((file) => file !== req.portFile)
    : [];
  if (elsewhere.length) {
    return {
      status: "refused",
      reason:
        `${req.methodName} is already ported in ${elsewhere.join(", ")} — scaffolding it ` +
        `into ${req.portFile} would duplicate it.`,
    };
  }

  const anchorBefore = (() => {
    for (let i = targetIndex - 1; i >= 0; i--) {
      const fn = localHit(port, generated[i]);
      if (fn) return { name: generated[i].name, fn };
    }
    return undefined;
  })();
  const anchorAfter = (() => {
    for (let i = targetIndex + 1; i < generated.length; i++) {
      const fn = localHit(port, generated[i]);
      if (fn) return { name: generated[i].name, fn };
    }
    return undefined;
  })();

  const block = `${APPLY_MARKER}\n${target.text}`;
  if (anchorBefore) {
    const at = topLevelStatement(anchorBefore.fn).getEnd();
    const source = `${req.portSource.slice(0, at)}\n\n${block}${req.portSource.slice(at)}`;
    return { status: "applied", source, insertedAfter: anchorBefore.name };
  }
  if (anchorAfter) {
    const stmt = topLevelStatement(anchorAfter.fn);
    const at = stmt.getStart(stmt.getSourceFile());
    const source = `${req.portSource.slice(0, at)}${block}\n\n${req.portSource.slice(at)}`;
    return { status: "applied", source, insertedBefore: anchorAfter.name };
  }
  const trimmed = req.portSource.replace(/\s*$/, "");
  return { status: "applied", source: `${trimmed}\n\n${block}\n` };
}
