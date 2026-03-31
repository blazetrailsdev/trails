/**
 * PostgreSQL quoting — PostgreSQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting
 */

export class IntegerOutOf64BitRange extends RangeError {
  constructor(value: bigint | number) {
    super(
      `${value} is out of range for PostgreSQL bigint (64-bit signed integer): ` +
        `-9223372036854775808 to 9223372036854775807`,
    );
    this.name = "IntegerOutOf64BitRange";
  }
}

const PG_INT64_MIN = BigInt("-9223372036854775808");
const PG_INT64_MAX = BigInt("9223372036854775807");

export interface Quoting {
  quotedTrue(): string;
  unquotedTrue(): boolean;
  quotedFalse(): string;
  unquotedFalse(): boolean;
  quotedDate(date: Date): string;
  quotedTimeUtc(date: Date): string;
  quoteTableName(name: string): string;
  quoteColumnName(name: string): string;
  quoteString(value: string): string;
  quoteBinaryColumn(value: Buffer): string;
}

export function quotedTrue(): string {
  return "'t'";
}

export function unquotedTrue(): boolean {
  return true;
}

export function quotedFalse(): string {
  return "'f'";
}

export function unquotedFalse(): boolean {
  return false;
}

export function quotedDate(date: Date): string {
  return `'${date.toISOString().split("T")[0]}'`;
}

export function quotedTimeUtc(date: Date): string {
  return `'${date.toISOString().replace("T", " ").replace("Z", "")}'`;
}

export function quoteTableName(name: string): string {
  return splitSchemaQualifiedName(name)
    .map((part) => {
      const unquoted =
        part.startsWith('"') && part.endsWith('"') && part.length >= 2
          ? part.slice(1, -1).replace(/""/g, '"')
          : part;
      return `"${unquoted.replace(/"/g, '""')}"`;
    })
    .join(".");
}

function splitSchemaQualifiedName(name: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    if (ch === '"') {
      current += ch;
      if (inQuotes && i + 1 < name.length && name[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "." && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  parts.push(current);
  return parts;
}

export function quoteColumnName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteString(value: string): string {
  if (value.includes("\\")) {
    return `E'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

export function quoteBinaryColumn(value: Buffer): string {
  return `'\\x${value.toString("hex")}'`;
}

export function checkIntegerRange(value: bigint | number): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new IntegerOutOf64BitRange(value);
    }
  }
  const bigVal = typeof value === "bigint" ? value : BigInt(value);
  if (bigVal < PG_INT64_MIN || bigVal > PG_INT64_MAX) {
    throw new IntegerOutOf64BitRange(value);
  }
}
