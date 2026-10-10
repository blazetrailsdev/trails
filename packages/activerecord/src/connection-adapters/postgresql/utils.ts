import { rbHash } from "@blazetrails/activesupport";
import { rbEqual, stringValue } from "@blazetrails/ruby-compat";

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
    const quoteIdent = (str: unknown) => `"${stringValue(str).replace(/"/g, '""')}"`;
    if (this.schema != null) {
      return quoteIdent(this.schema) + Name.SEPARATOR + quoteIdent(this.identifier);
    } else {
      return quoteIdent(this.identifier);
    }
  }

  equals(o: unknown): boolean {
    return (
      (o as Name | null)?.constructor === this.constructor &&
      rbEqual((o as Name).parts(), this.parts())
    );
  }

  eql(o: unknown): boolean {
    return this.equals(o);
  }

  hash(): number {
    return rbHash(this.parts());
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
