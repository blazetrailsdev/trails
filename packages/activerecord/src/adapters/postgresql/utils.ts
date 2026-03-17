/**
 * Mirrors Rails ActiveRecord::ConnectionAdapters::PostgreSQL::Utils
 * and ActiveRecord::ConnectionAdapters::PostgreSQL::Name
 */

export class PgName {
  readonly schema: string | null;
  readonly identifier: string;

  constructor(schema: string | null, identifier: string) {
    this.schema = schema ? schema.replace(/^"|"$/g, "") : null;
    this.identifier = identifier.replace(/^"|"$/g, "");
  }

  toString(): string {
    if (this.schema) {
      return `${this.schema}.${this.identifier}`;
    }
    return this.identifier;
  }

  quoted(): string {
    if (this.schema) {
      return `"${this.schema}"."${this.identifier}"`;
    }
    return `"${this.identifier}"`;
  }

  equals(other: PgName): boolean {
    return this.schema === other.schema && this.identifier === other.identifier;
  }

  hashKey(): string {
    return `${this.schema ?? ""}.${this.identifier}`;
  }
}

export function extractSchemaQualifiedName(name: string): PgName {
  const parts = splitQuotedIdentifier(name);
  if (parts.length === 2) {
    return new PgName(parts[0], parts[1]);
  }
  return new PgName(null, parts[0]);
}

function splitQuotedIdentifier(name: string): string[] {
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
