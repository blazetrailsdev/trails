export class Name {
  static readonly SEPARATOR = ".";

  readonly schema: string | null;
  readonly identifier: string;

  constructor(schema: string | null, identifier: string) {
    this.schema = Utils.unquoteIdentifier(schema);
    this.identifier = Utils.unquoteIdentifier(identifier);
  }

  toString(): string {
    return this.parts().join(Name.SEPARATOR);
  }

  quoted(): string {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    if (this.schema) {
      return `${esc(this.schema)}.${esc(this.identifier)}`;
    }
    return esc(this.identifier);
  }

  equals(other: Name): boolean {
    return this.schema === other.schema && this.identifier === other.identifier;
  }

  hashKey(): string {
    return JSON.stringify([this.schema, this.identifier]);
  }

  /** @internal */
  protected parts(): string[] {
    return [this.schema, this.identifier].filter((p): p is string => p != null);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Utils {
  export function extractSchemaQualifiedName(string: string): Name {
    let [schema, table]: (string | undefined)[] = string.match(/[^".]+|"[^"]*"/g) ?? [];
    if (table == null) {
      table = schema;
      schema = undefined;
    }
    return new Name(schema ?? null, table);
  }

  export function unquoteIdentifier<T extends string | null | undefined>(identifier: T): T {
    if (identifier != null && identifier.startsWith('"')) {
      return identifier.slice(1, -1) as T;
    } else {
      return identifier;
    }
  }
}
