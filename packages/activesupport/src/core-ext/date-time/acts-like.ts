/**
 * Mirrors: `core_ext/date_time/acts_like.rb` — Ruby reopens `DateTime` to add
 * the two duck-type markers `Object#acts_like?` looks for.
 *
 * TypeScript cannot reopen a class another package owns, so the reopening is a
 * class of the Ruby name whose members take the receiver as the first
 * parameter — the idiom `core-ext/object/acts-like.ts` and
 * `core-ext/object/blank.ts` already use for `NilClass` / `String` / `Time`.
 *
 * `Object.actsLike` finds a marker by looking for a method of the translated
 * name on the value (acts-like.ts:38-44), so `DateTime` values reach these
 * through that lookup rather than by calling them directly.
 */

/** The `DateTime` Ruby reopens. */
export class DateTime {
  /** Duck-types as a Date-like class. See `Object#acts_like?`. */
  static actsLikeDate(): boolean {
    return true;
  }

  /** Duck-types as a Time-like class. See `Object#acts_like?`. */
  static actsLikeTime(): boolean {
    return true;
  }
}
