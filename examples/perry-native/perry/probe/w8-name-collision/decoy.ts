// An unrelated class that happens to share the name, with only a static
// member, exported by a module nobody imports `Shared` from.
export class Shared {
  static asText(value: { name: string }): string {
    return value.name;
  }
}
export function helper(): string {
  return Shared.asText({ name: "decoy" });
}
