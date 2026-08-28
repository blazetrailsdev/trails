/**
 * Mirrors: Object#with_options
 * (activesupport/lib/active_support/core_ext/object/with_options.rb:92)
 *
 * Ruby monkey-patches Object; TypeScript cannot, so the receiver is the first
 * argument — the same shape `objectWith` uses for Object#with.
 *
 * Only the `block.call(option_merger)` arm of `with_options.rb:96` is ported.
 * The zero-arity arm rebinds `self` to the merger via `instance_eval`, and
 * JavaScript has no way to rebind the lexical scope a function body already
 * closed over — a zero-parameter block cannot reach the merger at all. So
 * implicit-receiver `with_options` (`option_merger_test.rb:101-107`) has no
 * form here; callers take the merger as the block's parameter. Tracked as
 * `with-options-implicit-receiver-instance-eval-arm`, in the
 * activesupport-surfaced-deviations bucket.
 */

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
