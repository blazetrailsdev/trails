export const ANY_TAG_LINE: RegExp;

export function lineLeadingTagReasons(text: string, tag: string): string[];

export function lineLeadingTag(rawLine: string): { name: string; text: string } | null;
