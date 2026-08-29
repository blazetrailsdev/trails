export type TagValue = string | number | boolean | null | undefined;

export interface QueryLogsFormatter {
  format(key: string, value: TagValue): string;
  join(pairs: string[]): string;
}

export class LegacyFormatter {
  static format(key: string, value: TagValue): string {
    return `${key}:${value}`;
  }
  static join(pairs: string[]): string {
    return pairs.join(",");
  }
}

export class SQLCommenter {
  static format(key: string, value: TagValue): string {
    return `${sqlCommenterEncode(key)}='${sqlCommenterEncode(String(value))}'`;
  }
  static join(pairs: string[]): string {
    return pairs.join(",");
  }
}

function sqlCommenterEncode(value: string): string {
  return encodeURIComponent(value).replace(/'/g, "%27");
}
