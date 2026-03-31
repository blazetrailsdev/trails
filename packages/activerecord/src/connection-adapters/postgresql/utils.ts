/**
 * PostgreSQL utilities — name parsing and schema-qualified name handling.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Utils (module)
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::Name (class)
 */

export class Name {
  readonly schema: string | null;
  readonly identifier: string;

  constructor(schema: string | null, identifier: string) {
    this.schema = schema ? unquoteIdentifier(schema) : null;
    this.identifier = unquoteIdentifier(identifier);
  }

  toString(): string {
    if (this.schema) {
      return `${this.schema}.${this.identifier}`;
    }
    return this.identifier;
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
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Utils {
  export function extractSchemaQualifiedName(name: string): Name {
    const parts = splitQuotedIdentifier(name);
    if (parts.length === 0) {
      return new Name(null, "");
    }
    if (parts.length === 2) {
      return new Name(parts[0], parts[1]);
    }
    return new Name(null, parts[0]);
  }
}

function unquoteIdentifier(name: string): string {
  if (name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1).replace(/""/g, '"');
  }
  return name;
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
