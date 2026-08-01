import ts from "typescript";
import { indexPortFile, nameCandidates, type GlobalPortIndex } from "./score.js";

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
}

export type ApplyPlan =
  | { status: "applied"; source: string; insertedAfter?: string; insertedBefore?: string }
  | { status: "refused"; reason: string };

function generatedFunctions(generatedCode: string): { name: string; text: string }[] {
  const sf = ts.createSourceFile(
    "gen.js",
    generatedCode,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  const out: { name: string; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.body
    ) {
      out.push({ name: node.name.text, text: node.getText(sf).trim() });
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

function findLocal(
  port: ReturnType<typeof indexPortFile>,
  name: string,
): ts.FunctionLikeDeclaration | undefined {
  for (const candidate of nameCandidates(name)) {
    const found = port.byName.get(candidate);
    if (found) return found;
  }
  return undefined;
}

function elsewhereHit(
  globalIndex: GlobalPortIndex | undefined,
  portFile: string,
  name: string,
): string | undefined {
  if (!globalIndex) return undefined;
  for (const candidate of nameCandidates(name)) {
    for (const hit of globalIndex.byName.get(candidate) ?? []) {
      if (hit.file !== portFile) return hit.file;
    }
  }
  return undefined;
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

  const port = indexPortFile(req.portSource);
  if (findLocal(port, req.methodName)) {
    return {
      status: "refused",
      reason: `${req.methodName} is already defined in ${req.portFile}.`,
    };
  }
  const elsewhere = elsewhereHit(req.globalIndex, req.portFile, req.methodName);
  if (elsewhere) {
    return {
      status: "refused",
      reason:
        `${req.methodName} is already ported in ${elsewhere} — scaffolding it into ` +
        `${req.portFile} would duplicate it.`,
    };
  }

  const anchorBefore = (() => {
    for (let i = targetIndex - 1; i >= 0; i--) {
      const fn = findLocal(port, generated[i].name);
      if (fn) return { name: generated[i].name, fn };
    }
    return undefined;
  })();
  const anchorAfter = (() => {
    for (let i = targetIndex + 1; i < generated.length; i++) {
      const fn = findLocal(port, generated[i].name);
      if (fn) return { name: generated[i].name, fn };
    }
    return undefined;
  })();

  const block = `${APPLY_MARKER}\n${generated[targetIndex].text}`;
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
