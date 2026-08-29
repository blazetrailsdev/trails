interface DynamicMatchersHost {
  name: string;
  columnsHash(): Record<string, unknown>;
  attributeAliases?: Record<string, string>;
}

export function respondToMissing(this: DynamicMatchersHost, methodName: string): boolean {
  if (this.name === "Base") return false;
  if (!methodName.startsWith("findBy")) return false;
  const attrPart = methodName.slice(6);
  if (!attrPart) return false;
  const snakePart = attrPart
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const attributeNames = snakePart.split("_and_");
  const aliases = this.attributeAliases;
  const columnsHash = this.columnsHash();
  return attributeNames.every((name) => {
    const resolved = aliases?.[name] ?? name;
    return columnsHash[resolved] != null;
  });
}
