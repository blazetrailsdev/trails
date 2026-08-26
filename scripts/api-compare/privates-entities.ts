/**
 * The `entities` half of `eslint/rails-private-methods.json`: for each TS file,
 * the names of the Ruby entities that project onto it.
 *
 * It is keyed off the entity walk alone — `noteEntity` runs once per host in
 * `build-rails-privates-manifest.ts`'s `visit()`, unconditionally — and NOT off
 * the per-file visibility map, which only gains a key when some entity
 * contributes a method to that Ruby file. A Rails entity with no methods would
 * otherwise be absent from `entities` while a method-bearing sibling in the
 * same file still listed the file-wide name union, leaving the method-less
 * entity's members silently un-gated (RFC 0121).
 */
export function entitiesByTsFile(
  fileEntities: Map<string, Set<string>>,
  tsRelFor: (rubyFile: string) => string,
  into: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const [rubyFile, entities] of fileEntities) {
    if (entities.size === 0) continue;
    const tsRel = tsRelFor(rubyFile);
    into[tsRel] = [...new Set([...(into[tsRel] ?? []), ...entities])].sort();
  }
  return into;
}
