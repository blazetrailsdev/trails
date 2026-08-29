export class Name {
  static readonly SEPARATOR = ".";

  readonly schema: string | null;
  readonly identifier: string;

  constructor(schema: string | null, identifier: string) {
    this.schema = schema ? unquoteIdentifier(schema) : null;
    this.identifier = unquoteIdentifier(identifier);
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
    const parts = splitQuotedIdentifier(string);
    let schema: string | null = parts[0] ?? null;
    let table = parts[1] ?? null;
    if (table == null) {
      table = schema;
      schema = null;
    }
    return new Name(schema, table ?? "");
  }
}

export function unquoteIdentifier(identifier: string): string {
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replace(/""/g, '"');
  }
  return identifier;
}

export function splitQuotedIdentifier(name: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < name.length) {
    if (name[i] === '"') {
      let value = "";
      i++;
      while (i < name.length) {
        if (name[i] === '"') {
          if (i + 1 < name.length && name[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += name[i];
          i++;
        }
      }
      parts.push(value);
      if (i < name.length && name[i] === ".") i++;
    } else {
      const dot = name.indexOf(".", i);
      if (dot === -1) {
        parts.push(name.substring(i));
        break;
      }
      const part = name.substring(i, dot);
      if (part.length > 0) parts.push(part);
      i = dot + 1;
    }
  }
  return parts;
}
