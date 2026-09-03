import { OptionMerger } from "../../option-merger.js";

export function withOptions<T extends object>(object: T, options: Record<string, unknown>): T;
export function withOptions<T extends object, R>(
  object: T,
  options: Record<string, unknown>,
  block: (optionMerger: T) => R,
): R;
export function withOptions<T extends object, R>(
  object: T,
  options: Record<string, unknown>,
  block: ((optionMerger: T) => R) | undefined,
): R | T;
export function withOptions<T extends object, R>(
  object: T,
  options: Record<string, unknown>,
  block?: (optionMerger: T) => R,
): R | T {
  const optionMerger = new OptionMerger(object, options) as unknown as T;

  if (block) {
    return block(optionMerger);
  } else {
    return optionMerger;
  }
}
