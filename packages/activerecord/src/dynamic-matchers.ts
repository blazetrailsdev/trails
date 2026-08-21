/**
 * Mirrors `ActiveRecord::DynamicMatchers`
 * (`vendor/rails/activerecord/lib/active_record/dynamic_matchers.rb`).
 */

/** Host shape `respondToMissing` reads off the model class. */
interface DynamicMatchersHost {
  name: string;
  columnsHash(): Record<string, unknown>;
  attributeAliases?: Record<string, string>;
}

/**
 * Mirrors `DynamicMatchers::ClassMethods#respond_to_missing?`
 * (dynamic_matchers.rb:6-13): a `findBy*` name responds when every attribute it
 * names — resolved through `attribute_aliases`, as `Method#initialize` does
 * (dynamic_matchers.rb:52) — is a known attribute, which is `Method#valid?`
 * (dynamic_matchers.rb:57).
 *
 * `if self == Base then super` (dynamic_matchers.rb:7-8) comes first: `Base`
 * itself never runs `Method.match`, whose `valid?` would reflect columns on a
 * class that has no table.
 */
export function respondToMissing(this: DynamicMatchersHost, methodName: string): boolean {
  if (this.name === "Base") return false;
  if (!methodName.startsWith("findBy")) return false;
  const attrPart = methodName.slice(6); // remove "findBy"
  if (!attrPart) return false;
  // Convert camelCase suffix to snake_case: TitleAndAuthorName → title_and_author_name
  const snakePart = attrPart
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  // Split on "_and_" like Rails' Method#attribute_names
  const attributeNames = snakePart.split("_and_");
  const aliases = this.attributeAliases;
  const columnsHash = this.columnsHash();
  return attributeNames.every((name) => {
    const resolved = aliases?.[name] ?? name;
    return columnsHash[resolved] != null;
  });
}
