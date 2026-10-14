import { classify, singularize } from "@blazetrails/activesupport";
import type { AssociationCall } from "./walker.js";

export function resolveAssociationTarget(call: AssociationCall): string {
  const explicit = call.options["className"];
  if (explicit) return stripQuotes(explicit);
  return classify(call.name);
}

export type ModelAssociationLookup = (className: string) => readonly AssociationCall[] | undefined;

export function isEmittableTargetName(
  name: string,
  isRegistered: (name: string) => boolean,
  isVisible: (name: string) => boolean,
): boolean {
  return name === "Base" || isRegistered(name) || isVisible(name);
}

export function resolveThroughTarget(
  definingAssocs: readonly AssociationCall[],
  call: AssociationCall,
  lookup: ModelAssociationLookup,
  aliases?: ReadonlyMap<string, string>,
  seen: Set<string> = new Set(),
): string | undefined {
  const throughRaw = call.options["through"];
  if (!throughRaw) return undefined;
  const throughName = stripQuotes(throughRaw);
  const guard = `${throughName}\u0000${call.name}`;
  if (seen.has(guard)) return undefined;
  seen.add(guard);

  const sourceType = call.options["sourceType"];
  if (sourceType) return resolveAlias(stripQuotes(sourceType), aliases);

  const throughAssoc = definingAssocs.find((a) => a.name === throughName);
  if (!throughAssoc) return undefined;
  const throughModel = targetClassOf(definingAssocs, throughAssoc, lookup, aliases, seen);
  if (!throughModel) return undefined;
  const throughModelAssocs = lookup(throughModel);
  if (!throughModelAssocs) return undefined;

  const sourceRaw = call.options["source"];
  const candidates = sourceRaw ? [stripQuotes(sourceRaw)] : [singularize(call.name), call.name];
  for (const candidate of candidates) {
    const source = throughModelAssocs.find((a) => a.name === candidate);
    if (source) return targetClassOf(throughModelAssocs, source, lookup, aliases, seen);
  }
  return undefined;
}

function targetClassOf(
  definingAssocs: readonly AssociationCall[],
  assoc: AssociationCall,
  lookup: ModelAssociationLookup,
  aliases: ReadonlyMap<string, string> | undefined,
  seen: Set<string>,
): string | undefined {
  if (assoc.options["polymorphic"] === "true") return "Base";
  const explicit = assoc.options["className"];
  if (explicit) return resolveAlias(stripQuotes(explicit), aliases);
  if (assoc.options["through"])
    return resolveThroughTarget(definingAssocs, assoc, lookup, aliases, seen);
  return resolveAlias(classify(assoc.name), aliases);
}

function resolveAlias(name: string, aliases: ReadonlyMap<string, string> | undefined): string {
  return aliases?.get(name) ?? name;
}

export function stripQuotes(source: string): string {
  const first = source.charAt(0);
  if ((first === '"' || first === "'" || first === "`") && source.endsWith(first)) {
    return source.slice(1, -1);
  }
  return source;
}
