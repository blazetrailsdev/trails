import type { SafeBuffer } from "@blazetrails/activesupport";

/** The view-context methods Writebook's helpers call, typed for these modules. */
export interface ViewHost {
  tag(): Record<string, (...args: unknown[]) => SafeBuffer>;
  linkTo(...args: unknown[]): SafeBuffer;
  buttonTo(...args: unknown[]): Promise<SafeBuffer>;
  imageTag(source: unknown, options?: Record<string, unknown>): SafeBuffer;
  formWith(options: Record<string, unknown>, block?: unknown): Promise<SafeBuffer> | SafeBuffer;
  render(...args: unknown[]): Promise<SafeBuffer>;
  urlFor(options: unknown): string;
  domId(record: unknown, prefix?: string): string;
  sanitize(html: unknown, options?: Record<string, unknown>): SafeBuffer;
  highlight(text: unknown, phrases: unknown, options?: Record<string, unknown>): SafeBuffer;
  pluralize(count: unknown, singular: string): string;
  numberWithDelimiter(number: unknown): string;
  concat(value: unknown): void;
  [helper: string]: unknown;
}
