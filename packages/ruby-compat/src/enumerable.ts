/**
 * Ruby's core `Enumerable` module (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`):
 * members derived from the including class's `each`, mixed in with
 * `include(Klass, Enumerable)`. Where `each` answers a promise, each member
 * answers a promise of its result.
 *
 * Only the members a trails includer reaches are ported; the rest of
 * `Init_Enumerable` joins as a caller needs it.
 */

import { classModule } from "./class-module.js";
import { ArgumentError } from "./argument-error.js";
import { Hash } from "./hash.js";
import {
  numericPlus,
  rbBigNorm,
  rbDbl2num,
  rbFloatTypeP,
  rbIntegerTypeP,
  rbPlus,
} from "./numeric.js";
import { rbFSend } from "./object.js";
import { Rational } from "./rational.js";
import { checkArity } from "./string/support.js";
import { cmp, rbCmpint } from "./comparable.js";
import { rbEqq, rbEqual } from "./rb-equal.js";
import { isSymbol, stringToSym, symbolToS } from "./symbol.js";

/** @noRailsEquivalent PERMANENT */
export interface Each<T, E = unknown> {
  each(block: (i: T) => void): E;
}

/** @noRailsEquivalent PERMANENT */
export type Enumerated<E, R> = 0 extends 1 & E ? R : E extends Promise<unknown> ? Promise<R> : R;

const iterBreak = Symbol("rb_iter_break");

/**
 * `rb_block_call(obj, id_each, …)`: an `each` member where the receiver has
 * one, else its JS iterator, which is how an Array (`rb_ary_each`,
 * `vendor/ruby/v3.3.11/array.c:2532`), a Set or a generator yields, and a Map
 * yields `[key, value]` as `rb_hash_each_pair` does (`vendor/ruby/v3.3.11/hash.c:3149`).
 */
function rbBlockCall<T, E, R>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T) => unknown,
  result: () => R,
  awaiting = false,
): Enumerated<E, R> {
  const rescue = (e: unknown): R => {
    if (e !== iterBreak) throw e;
    return result();
  };
  if (awaiting && typeof (obj as Partial<Each<T, E>>).each === "function") {
    let pending: PromiseLike<unknown> | null = null;
    const rest: T[] = [];
    return rbBlockCall(
      obj,
      (i) => {
        if (pending) return void rest.push(i);
        const r = block(i);
        if (r != null && typeof (r as PromiseLike<unknown>).then === "function") {
          pending = r as PromiseLike<unknown>;
        }
      },
      () => {
        if (!pending) return result();
        const awaited = pending;
        return (async () => {
          await awaited;
          for (const i of rest) await block(i);
          return result();
        })();
      },
    ) as Enumerated<E, R>;
  }
  let each: unknown;
  try {
    if (typeof (obj as Partial<Each<T, E>>).each === "function") {
      each = (obj as Each<T, E>).each(block);
    } else if (awaiting) {
      const it = (obj as Iterable<T>)[Symbol.iterator]();
      for (let step = it.next(); !step.done; step = it.next()) {
        const r = block(step.value);
        if (r != null && typeof (r as PromiseLike<unknown>).then === "function") {
          each = (async () => {
            await r;
            for (let step = it.next(); !step.done; step = it.next()) await block(step.value);
          })();
          break;
        }
      }
    } else {
      for (const i of obj as Iterable<T>) block(i);
    }
  } catch (e) {
    return rescue(e) as Enumerated<E, R>;
  }
  if (each instanceof Promise) return each.then(result, rescue) as Enumerated<E, R>;
  if (each != null && typeof (each as PromiseLike<unknown>).then === "function") {
    return Promise.resolve(each as PromiseLike<unknown>).then(result, rescue) as Enumerated<E, R>;
  }
  return result() as Enumerated<E, R>;
}

/**
 * `enum_to_a` (`vendor/ruby/v3.3.11/enum.c:711`): the elements `each` yields,
 * which is what a block-less member's enumerator (`RETURN_ENUMERATOR`) holds.
 * @noRailsEquivalent PERMANENT
 */
function enumToA<T, E = unknown>(obj: Iterable<T> | Each<T, E>): Enumerated<E, T[]> {
  const ary: T[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      ary.push(i);
    },
    () => ary,
  );
}

/**
 * Mirrors: Ruby's Enumerable#partition — `vendor/ruby/v3.3.11/enum.c:1102` `enum_partition`:
 * the elements whose block result `RTEST`s, then the others (`partition_i`, `:1057`).
 * @noRailsEquivalent PERMANENT
 */
export function partition<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T) => unknown,
): Enumerated<E, [T[], T[]]>;
/** @noRailsEquivalent PERMANENT */
export function partition<T, E = unknown>(obj: Iterable<T> | Each<T, E>): Enumerated<E, T[]>;
/** @noRailsEquivalent PERMANENT */
export function partition<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block?: (i: T) => unknown,
): Enumerated<E, [T[], T[]] | T[]> {
  if (!block) return enumToA(obj);
  const memo = { v1: [] as T[], v2: [] as T[] };
  return rbBlockCall(
    obj,
    (i) => {
      const result = block(i);
      if (result != null && result !== false) memo.v1.push(i);
      else memo.v2.push(i);
    },
    () => [memo.v1, memo.v2] as [T[], T[]],
  );
}

/**
 * Mirrors: Ruby's Enumerable#group_by — `vendor/ruby/v3.3.11/enum.c:1157` `enum_group_by`,
 * pushing each element onto the Array under its block result (`group_by_i`, `:1115`).
 * @noRailsEquivalent PERMANENT
 */
export function groupBy<T, K, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T) => K,
): Enumerated<E, Hash<K, T[]>>;
/** @noRailsEquivalent PERMANENT */
export function groupBy<T, K, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block?: (i: T) => K,
): Enumerated<E, Hash<K, T[]> | T[]>;
/** @noRailsEquivalent PERMANENT */
export function groupBy<T, K, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block?: (i: T) => K,
): Enumerated<E, Hash<K, T[]> | T[]> {
  if (!block) return enumToA(obj);
  const hash = new Hash<K, T[]>();
  return rbBlockCall(
    obj,
    (i) => {
      const group = block(i);
      const values = hash.get(group);
      if (values === undefined) hash.set(group, [i]);
      else values.push(i);
    },
    () => hash,
  );
}

/**
 * Mirrors: Ruby's Enumerable#tally — `vendor/ruby/v3.3.11/enum.c:1229` `enum_tally`: a
 * Hash counting each element (`tally_up`, `:1165`). The `hash` argument arm is
 * not ported: nothing passes one.
 * @noRailsEquivalent PERMANENT
 */
export function tally<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
): Enumerated<E, Hash<T, number>> {
  const hash = new Hash<T, number>();
  return rbBlockCall(
    obj,
    (i) => {
      const tally = hash.get(i);
      hash.set(i, tally === undefined ? 1 : tally + 1);
    },
    () => hash,
  );
}

/**
 * Mirrors: Ruby's Enumerable#find_all — `vendor/ruby/v3.3.11/enum.c:509` `enum_find_all`,
 * pushing each element whose block result `RTEST`s (`find_all_i`, `:456`).
 * @noRailsEquivalent PERMANENT
 */
function enumFindAll<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block?: (i: T) => unknown,
): Enumerated<E, T[]> {
  if (!block) return enumToA(obj);
  const ary: T[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      const result = block(i);
      if (result != null && result !== false) ary.push(i);
    },
    () => ary,
  );
}
export { enumFindAll as findAll };
export { enumToA as toA };

/**
 * Mirrors: Ruby's Enumerable#reject — `vendor/ruby/v3.3.11/enum.c:593` `enum_reject`,
 * pushing each element whose block result does not `RTEST` (`reject_i`, `:564`).
 * @noRailsEquivalent PERMANENT
 */
export function reject<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block?: (i: T) => unknown,
): Enumerated<E, T[]> {
  if (!block) return enumToA(obj);
  const ary: T[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      const result = block(i);
      if (result == null || result === false) ary.push(i);
    },
    () => ary,
  );
}

/**
 * Mirrors: Ruby's Enumerable#count — `vendor/ruby/v3.3.11/enum.c:298` `enum_count`:
 * every element (`count_all_i`, `:263`), those `rb_equal` to the argument
 * (`count_i`, `:239`), or those whose block result `RTEST`s (`count_iter_i`,
 * `:252`). The block is the trailing function argument.
 * @noRailsEquivalent PERMANENT
 */
export function count<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  ...argv: unknown[]
): Enumerated<E, number> {
  const block =
    argv.length === 1 && typeof argv[0] === "function"
      ? (argv.pop() as (i: T) => unknown)
      : undefined;
  checkArity(argv.length, 0, 1);
  const item = argv[0];
  let func: (i: T) => boolean;
  if (argv.length === 0) {
    if (block !== undefined) {
      func = (i) => {
        const result = block(i);
        return result != null && result !== false;
      };
    } else {
      func = () => true;
    }
  } else {
    func = (i) => rbEqual(i, item);
  }
  let n = 0;
  return rbBlockCall(
    obj,
    (i) => {
      if (func(i)) n++;
    },
    () => n,
  );
}

/**
 * Mirrors: Ruby's Enumerable#filter_map — `vendor/ruby/v3.3.11/enum.c:550` `enum_filter_map`,
 * pushing each block result that `RTEST`s (`filter_map_i`, `:522`).
 * @noRailsEquivalent PERMANENT
 */
export function filterMap<T, R, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T) => R | false | null | undefined,
): Enumerated<E, R[]> {
  const ary: R[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      const result = block(i);
      if (result != null && result !== false) ary.push(result);
    },
    () => ary,
  );
}

/**
 * Mirrors: Ruby's Enumerable#find — `vendor/ruby/v3.3.11/enum.c:361` `enum_find`,
 * breaking out of `each` at the first element whose block result `RTEST`s
 * (`find_i`, `:324`). The block is the last argument.
 * @noRailsEquivalent PERMANENT
 */
export function find<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  ...argv: unknown[]
): Enumerated<E, unknown> {
  const block = argv.pop() as (i: T) => unknown;
  checkArity(argv.length, 0, 1);
  const ifNone = argv.length > 0 ? argv[0] : null;
  const memo = { v1: null as unknown, cnt: 0 };
  return rbBlockCall(
    obj,
    (i) => {
      const result = block(i);
      if (result != null && result !== false) {
        memo.v1 = i;
        memo.cnt = 1;
        throw iterBreak;
      }
    },
    () => {
      if (memo.cnt) return memo.v1;
      if (ifNone != null) return rbFSend(ifNone, "call");
      return null;
    },
  );
}

/**
 * Mirrors: Ruby's Enumerable#map — `vendor/ruby/v3.3.11/enum.c:638` `enum_collect`.
 * @noRailsEquivalent PERMANENT
 */
export function map<T, R, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block?: (i: T) => R,
): Enumerated<E, R[] | T[]> {
  if (!block) return enumToA(obj);
  const ary: R[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      ary.push(block(i));
    },
    () => ary,
  );
}

/**
 * Mirrors: Ruby's Enumerable#first — `vendor/ruby/v3.3.11/enum.c:1284` `enum_first`,
 * whose `n` arm is `enum_take` (`:3514`).
 * @noRailsEquivalent PERMANENT
 */
export function first<T, E = unknown>(obj: Iterable<T> | Each<T, E>): Enumerated<E, T | null>;
/** @noRailsEquivalent PERMANENT */
export function first<T, E = unknown>(obj: Iterable<T> | Each<T, E>, n: number): Enumerated<E, T[]>;
/** @noRailsEquivalent PERMANENT */
export function first<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n?: number,
): Enumerated<E, T | null | T[]> {
  if (n !== undefined) {
    if (n < 0) throw new ArgumentError("attempt to take negative size");
    const result: T[] = [];
    if (n === 0) return result as Enumerated<E, T[]>;
    return rbBlockCall(
      obj,
      (i) => {
        result.push(i);
        if (result.length >= n) throw iterBreak;
      },
      () => result,
    );
  }
  let memo: T | null = null;
  return rbBlockCall(
    obj,
    (i) => {
      memo = i;
      throw iterBreak;
    },
    () => memo,
  );
}

/**
 * Mirrors: Ruby's Enumerable#take — `vendor/ruby/v3.3.11/enum.c:3514` `enum_take`, whose
 * `take_i` (`:3490`) breaks once `n` elements are pushed, so an endless `each` stops.
 * @noRailsEquivalent PERMANENT
 */
export function take<T, E = unknown>(obj: Iterable<T> | Each<T, E>, n: number): Enumerated<E, T[]> {
  if (n < 0) throw new ArgumentError("attempt to take negative size");
  const result: T[] = [];
  if (n === 0) return result as Enumerated<E, T[]>;
  return rbBlockCall(
    obj,
    (i) => {
      result.push(i);
      if (result.length >= n) throw iterBreak;
    },
    () => result,
  );
}

/**
 * Mirrors: Ruby's Enumerable#take_while — `vendor/ruby/v3.3.11/enum.c:3560` `enum_take_while`,
 * whose `take_while_i` (`:3533`) breaks at the first element the block answers falsy for.
 * @noRailsEquivalent PERMANENT
 */
export function takeWhile<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T) => unknown,
): Enumerated<E, T[]> {
  const ary: T[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      const r = block(i);
      if (r == null || r === false) throw iterBreak;
      ary.push(i);
    },
    () => ary,
  );
}

/**
 * Mirrors: Ruby's Enumerable#drop — `vendor/ruby/v3.3.11/enum.c:3603` `enum_drop`, whose
 * `drop_i` (`:3571`) counts `n` elements down before it pushes.
 * @noRailsEquivalent PERMANENT
 */
export function drop<T, E = unknown>(obj: Iterable<T> | Each<T, E>, n: number): Enumerated<E, T[]> {
  let len = n;

  if (len < 0) {
    throw new ArgumentError("attempt to drop negative size");
  }

  const result: T[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      if (len === 0) {
        result.push(i);
      } else {
        len--;
      }
    },
    () => result,
  );
}

/**
 * Mirrors: Ruby's Enumerable#each_with_index — `vendor/ruby/v3.3.11/enum.c:2967`
 * `enum_each_with_index`, yielding each element with its count
 * (`each_with_index_i`, `:2930`) and answering the receiver.
 * @noRailsEquivalent PERMANENT
 */
export function eachWithIndex<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T, n: number) => PromiseLike<unknown>,
): Promise<Iterable<T> | Each<T, E>>;
/** @noRailsEquivalent PERMANENT */
export function eachWithIndex<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T, n: number) => unknown,
): Enumerated<E, Iterable<T> | Each<T, E>>;
/** @noRailsEquivalent PERMANENT */
export function eachWithIndex<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T, n: number) => unknown,
): unknown {
  let n = 0;
  return rbBlockCall(
    obj,
    (i) => block(i, n++),
    () => obj,
    true,
  );
}

/**
 * Mirrors: Ruby's Enumerable#each_with_object — `vendor/ruby/v3.3.11/enum.c:3285`
 * `enum_each_with_object`, yielding each element with the memo
 * (`each_with_object_i`) and answering the memo.
 * @noRailsEquivalent PERMANENT
 */
export function eachWithObject<T, M, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  memo: M,
  block: (i: T, memo: M) => PromiseLike<unknown>,
): Promise<M>;
/** @noRailsEquivalent PERMANENT */
export function eachWithObject<T, M, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  memo: M,
  block: (i: T, memo: M) => unknown,
): Enumerated<E, M>;
/** @noRailsEquivalent PERMANENT */
export function eachWithObject<T, M, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  memo: M,
  block: (i: T, memo: M) => unknown,
): unknown {
  return rbBlockCall(
    obj,
    (i) => block(i, memo),
    () => memo,
    true,
  );
}

/**
 * Mirrors: Ruby's Enumerable#sort_by — `vendor/ruby/v3.3.11/enum.c:1651` `enum_sort_by`,
 * which pairs each element with its block value (`sort_by_i`) and sorts the
 * pairs by `<=>` on the values (`sort_by_cmp`, `:1379`).
 * @noRailsEquivalent PERMANENT
 */
export function sortBy<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block?: (i: T) => unknown,
): Enumerated<E, T[]> {
  if (!block) return enumToA(obj);
  const buf: [unknown, T][] = [];
  return rbBlockCall(
    obj,
    (i) => {
      buf.push([block(i), i]);
    },
    () => buf.sort(([a], [b]) => rbCmpint(cmp(a, b), a, b)).map(([, i]) => i),
  );
}

/**
 * Mirrors: Ruby's Enumerable#each_slice — `vendor/ruby/v3.3.11/enum.c:3166` `enum_each_slice`,
 * yielding each full slice as it fills (`each_slice_i`, `:3102`) and the
 * remainder last, then answering the receiver. With no block it answers the
 * slices, the elements of its `RETURN_SIZED_ENUMERATOR`.
 * @noRailsEquivalent PERMANENT
 */
export function eachSlice<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n: number,
): Enumerated<E, T[][]>;
/** @noRailsEquivalent PERMANENT */
export function eachSlice<T, O extends Iterable<T> | Each<T, unknown>>(
  obj: O,
  n: number,
  block: (slice: T[]) => unknown,
): Enumerated<O extends Each<T, infer E> ? E : unknown, O>;
/** @noRailsEquivalent PERMANENT */
export function eachSlice<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n: number,
  block?: (slice: T[]) => unknown,
): unknown {
  const size = Math.trunc(n);

  if (size <= 0) throw new ArgumentError("invalid slice size");
  const slices: T[][] = [];
  const yieldSlice = block ?? ((slice: T[]) => slices.push(slice));
  let ary: T[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      ary.push(i);
      if (ary.length === size) {
        yieldSlice(ary);
        ary = [];
      }
    },
    () => {
      if (ary.length > 0) yieldSlice(ary);
      return block ? obj : slices;
    },
  );
}

/**
 * Mirrors: Ruby's Enumerable#min_by — `vendor/ruby/v3.3.11/enum.c:2686` `enum_min_by`,
 * keeping the first element whose block value compares lowest (`min_by_i`,
 * `:2630`) and answering `nil` for an empty receiver. With `n` it answers the
 * `n` elements with the lowest block values, in order (`rb_nmin_run`).
 * @noRailsEquivalent PERMANENT
 */
export function minBy<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T) => unknown,
): Enumerated<E, T | null>;
/** @noRailsEquivalent PERMANENT */
export function minBy<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n: number | null,
  block: (i: T) => unknown,
): Enumerated<E, T[] | T | null>;
/** @noRailsEquivalent PERMANENT */
export function minBy<T, E = unknown>(obj: Iterable<T> | Each<T, E>, ...argv: unknown[]): unknown {
  const block = argv.pop() as (i: T) => unknown;
  checkArity(argv.length, 0, 1);
  const num = argv[0] as number | null | undefined;
  if (argv.length > 0 && num != null) {
    const size = Math.trunc(num);
    if (size < 0) throw new ArgumentError(`negative size (${size})`);
    const buf: [unknown, T][] = [];
    return rbBlockCall(
      obj,
      (i) => {
        buf.push([block(i), i]);
      },
      () =>
        buf
          .sort(([a], [b]) => rbCmpint(cmp(a, b), a, b))
          .slice(0, size)
          .map(([, i]) => i),
    );
  }
  let v1: unknown;
  let v2: T | null = null;
  let seen = false;
  return rbBlockCall(
    obj,
    (i) => {
      const v = block(i);
      if (!seen) {
        seen = true;
        v1 = v;
        v2 = i;
      } else if (rbCmpint(cmp(v, v1), v, v1) < 0) {
        v1 = v;
        v2 = i;
      }
    },
    () => v2,
  );
}

/**
 * Mirrors: Ruby's Enumerable#max_by — `vendor/ruby/v3.3.11/enum.c:2760` `enum_max_by`,
 * the `max_by_i` (`:2704`) twin of {@link minBy}.
 * @noRailsEquivalent PERMANENT
 */
export function maxBy<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  block: (i: T) => unknown,
): Enumerated<E, T | null>;
/** @noRailsEquivalent PERMANENT */
export function maxBy<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n: number | null,
  block: (i: T) => unknown,
): Enumerated<E, T[] | T | null>;
/** @noRailsEquivalent PERMANENT */
export function maxBy<T, E = unknown>(obj: Iterable<T> | Each<T, E>, ...argv: unknown[]): unknown {
  const block = argv.pop() as (i: T) => unknown;
  checkArity(argv.length, 0, 1);
  const num = argv[0] as number | null | undefined;
  if (argv.length > 0 && num != null) {
    const size = Math.trunc(num);
    if (size < 0) throw new ArgumentError(`negative size (${size})`);
    const buf: [unknown, T][] = [];
    return rbBlockCall(
      obj,
      (i) => {
        buf.push([block(i), i]);
      },
      () =>
        buf
          .sort(([a], [b]) => rbCmpint(cmp(b, a), b, a))
          .slice(0, size)
          .map(([, i]) => i),
    );
  }
  let v1: unknown;
  let v2: T | null = null;
  let seen = false;
  return rbBlockCall(
    obj,
    (i) => {
      const v = block(i);
      if (!seen) {
        seen = true;
        v1 = v;
        v2 = i;
      } else if (rbCmpint(cmp(v, v1), v, v1) > 0) {
        v1 = v;
        v2 = i;
      }
    },
    () => v2,
  );
}

/**
 * Mirrors: Ruby's Enumerable#each_cons — `vendor/ruby/v3.3.11/enum.c:3244` `enum_each_cons`,
 * which raises `ArgumentError "invalid size"` for a size that is not positive
 * and yields each window of `n` consecutive elements as it fills
 * (`each_cons_i`, `:3187`), answering the receiver. With no block it answers
 * the windows, the elements of its `RETURN_SIZED_ENUMERATOR`.
 * @noRailsEquivalent PERMANENT
 */
export function eachCons<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n: number,
): Enumerated<E, T[][]>;
/** @noRailsEquivalent PERMANENT */
export function eachCons<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n: number,
  block: (cons: T[]) => unknown,
): Enumerated<E, Iterable<T> | Each<T, E>>;
/** @noRailsEquivalent PERMANENT */
export function eachCons<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  n: number,
  block?: (cons: T[]) => unknown,
): unknown {
  const size = Math.trunc(n);

  if (size <= 0) throw new ArgumentError("invalid size");
  const windows: T[][] = [];
  const yieldCons = block ?? ((cons: T[]) => windows.push(cons));
  const ary: T[] = [];
  return rbBlockCall(
    obj,
    (i) => {
      if (ary.length === size) ary.shift();
      ary.push(i);
      if (ary.length === size) yieldCons([...ary]);
    },
    () => (block ? obj : windows),
  );
}

function enumfunc<T>(args: unknown[]): (i: T) => unknown {
  checkArity(args.length, 0, 1);
  return args.length > 0 ? (i) => rbEqq(args[0], i) : (i) => i;
}

/**
 * Mirrors: Ruby's Enumerable#all? — `vendor/ruby/v3.3.11/enum.c:1799` `enum_all`,
 * breaking on the first element whose `pattern === element`, or the element
 * itself with no argument, fails `RTEST`.
 * @noRailsEquivalent PERMANENT
 */
export function isAll<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  ...args: unknown[]
): Enumerated<E, boolean> {
  const func = enumfunc<T>(args);
  let memo = true;
  return rbBlockCall(
    obj,
    (i) => {
      const result = func(i);
      if (result == null || result === false) {
        memo = false;
        throw iterBreak;
      }
    },
    () => memo,
  );
}

/**
 * Mirrors: Ruby's Enumerable#any? — `vendor/ruby/v3.3.11/enum.c:1861` `enum_any`,
 * `RTEST`ing `pattern === element`, or the element itself with no argument.
 * @noRailsEquivalent PERMANENT
 */
export function isAny<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  ...args: unknown[]
): Enumerated<E, boolean> {
  const func = enumfunc<T>(args);
  let memo = false;
  return rbBlockCall(
    obj,
    (i) => {
      const result = func(i);
      if (result != null && result !== false) {
        memo = true;
        throw iterBreak;
      }
    },
    () => memo,
  );
}

/**
 * Mirrors: Ruby's Enumerable#one? — `vendor/ruby/v3.3.11/enum.c:2148` `enum_one`, which
 * breaks on the second match (`:1869`).
 * @noRailsEquivalent PERMANENT
 */
export function isOne<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  ...args: unknown[]
): Enumerated<E, boolean> {
  const func = enumfunc<T>(args);
  let memo: boolean | undefined = undefined;
  return rbBlockCall(
    obj,
    (i) => {
      const result = func(i);
      if (result != null && result !== false) {
        if (memo === undefined) {
          memo = true;
        } else if (memo === true) {
          memo = false;
          throw iterBreak;
        }
      }
    },
    () => memo === true,
  );
}

/**
 * Mirrors: Ruby's Enumerable#none? — `vendor/ruby/v3.3.11/enum.c:2210` `enum_none`
 * (`:2160`).
 * @noRailsEquivalent PERMANENT
 */
export function isNone<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  ...args: unknown[]
): Enumerated<E, boolean> {
  const func = enumfunc<T>(args);
  let memo = true;
  return rbBlockCall(
    obj,
    (i) => {
      const result = func(i);
      if (result != null && result !== false) {
        memo = false;
        throw iterBreak;
      }
    },
    () => memo,
  );
}

/**
 * Mirrors: Ruby's Enumerable#include? — `vendor/ruby/v3.3.11/enum.c:2921` `enum_member`,
 * whose `member_i` (`:2892`) asks `rb_equal(element, val)` and breaks on the first hit.
 * @noRailsEquivalent PERMANENT
 */
export function isInclude<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  val: unknown,
): Enumerated<E, boolean> {
  let memo = false;
  return rbBlockCall(
    obj,
    (i) => {
      if (rbEqual(i, val)) {
        memo = true;
        throw iterBreak;
      }
    },
    () => memo,
  );
}

/**
 * The JS spelling of what `for x in enum` / `*enum` read off `each`:
 * `vendor/ruby/v3.3.11/enum.c:711` `enum_to_a`, iterated. An `each` that
 * answers a promise has yielded nothing yet, so it raises.
 * @noRailsEquivalent PERMANENT
 */
function iterator<T, E = unknown>(this: Each<T, E>): IterableIterator<T> {
  const ary: unknown = enumToA(this);
  if (ary instanceof Promise) {
    ary.catch(() => {});
    throw new TypeError("each is asynchronous: await it before iterating");
  }
  return (ary as T[])[Symbol.iterator]();
}

interface EnumSumMemo {
  v: unknown;
  r: Rational | undefined;
  n: number;
  f: number;
  c: number;
  blockGiven: boolean;
  floatValue: boolean;
}

function sumIterNormalizeMemo(memo: EnumSumMemo): void {
  memo.v = numericPlus(memo.n, memo.v);
  memo.n = 0;
  if (memo.r !== undefined) memo.v = numericPlus(memo.r, memo.v);
  memo.r = undefined;
}

function sumIterFixnum(i: number, memo: EnumSumMemo): void {
  if (Number.isSafeInteger(memo.n + i)) {
    memo.n += i;
  } else {
    memo.v = numericPlus(rbBigNorm(BigInt(memo.n) + BigInt(i)), memo.v);
    memo.n = 0;
  }
}

function sumIterBignum(i: bigint, memo: EnumSumMemo): void {
  memo.v = numericPlus(i, memo.v);
}

function sumIterRational(i: Rational, memo: EnumSumMemo): void {
  if (memo.r === undefined) memo.r = i;
  else memo.r = memo.r.add(i);
}

/** `sum_iter_some_value` (`vendor/ruby/v3.3.11/enum.c:4581`): `memo->v + i`. */
function sumIterSomeValue(i: unknown, memo: EnumSumMemo): void {
  memo.v = rbPlus(memo.v, i);
}

function sumIterKahanBabuska(i: unknown, memo: EnumSumMemo): void {
  let x: number;
  if (rbFloatTypeP(i)) x = i.valueOf();
  else if (typeof i === "number") x = i;
  else if (typeof i === "bigint") x = Number(i);
  else if (i instanceof Rational) x = i.toF();
  else {
    memo.v = rbDbl2num(memo.f);
    memo.floatValue = false;
    sumIterSomeValue(i, memo);
    return;
  }
  const f = memo.f;
  if (Number.isNaN(f)) return;
  else if (!Number.isFinite(x)) {
    if (!Number.isNaN(x) && !Number.isFinite(f) && x > 0 !== f > 0) {
      i = rbDbl2num(f);
      x = NaN;
    }
    memo.v = i;
    memo.f = x;
    return;
  } else if (!Number.isFinite(f)) return;

  let c = memo.c;
  const t = f + x;
  if (Math.abs(f) >= Math.abs(x)) c += f - t + x;
  else c += x - t + f;
  memo.f = t;
  memo.c = c;
}

function sumIter(i: unknown, memo: EnumSumMemo): void {
  if (memo.floatValue) {
    sumIterKahanBabuska(i, memo);
  } else if (rbIntegerTypeP(memo.v) || rbFloatTypeP(memo.v) || memo.v instanceof Rational) {
    if (typeof i === "number" && Number.isInteger(i)) sumIterFixnum(i, memo);
    else if (typeof i === "bigint") sumIterBignum(i, memo);
    else if (i instanceof Rational) sumIterRational(i, memo);
    else if (rbFloatTypeP(i)) {
      sumIterNormalizeMemo(memo);
      memo.f = memo.v instanceof Rational ? memo.v.toF() : Number((memo.v as number).valueOf());
      memo.c = 0.0;
      memo.floatValue = true;
      sumIterKahanBabuska(i, memo);
    } else {
      sumIterNormalizeMemo(memo);
      sumIterSomeValue(i, memo);
    }
  } else {
    sumIterSomeValue(i, memo);
  }
}

function enumSumMemo<T>(args: unknown[]): [EnumSumMemo, ((element: T) => unknown) | undefined] {
  const block =
    typeof args[args.length - 1] === "function"
      ? (args.pop() as (element: T) => unknown)
      : undefined;
  if (args.length > 1) {
    throw new ArgumentError(`wrong number of arguments (given ${args.length}, expected 0..1)`);
  }
  const memo: EnumSumMemo = {
    v: args.length === 0 ? 0 : args[0],
    blockGiven: block !== undefined,
    n: 0,
    r: undefined,
    f: 0.0,
    c: 0.0,
    floatValue: false,
  };

  if ((memo.floatValue = rbFloatTypeP(memo.v))) {
    memo.f = memo.v.valueOf();
    memo.c = 0.0;
  }
  return [memo, block];
}

function enumSumValue(memo: EnumSumMemo): unknown {
  if (memo.floatValue) {
    return rbDbl2num(memo.f + memo.c);
  } else {
    if (memo.n !== 0) memo.v = numericPlus(memo.n, memo.v);
    if (memo.r !== undefined) memo.v = numericPlus(memo.r, memo.v);
    return memo.v;
  }
}

/**
 * Mirrors: Ruby's Enumerable#sum — `vendor/ruby/v3.3.11/enum.c:4753` `enum_sum`. The
 * block is the trailing function argument, so a function cannot be the initial
 * value. The Range arm (`int_range_sum`, `:4706`) is the caller's, and no
 * includer is a Hash.
 * @noRailsEquivalent PERMANENT
 */
export function sum<T, E = unknown>(obj: Iterable<T> | Each<T, E>, ...args: unknown[]): unknown {
  const [memo, block] = enumSumMemo<T>(args);
  return rbBlockCall(
    obj,
    (i) => {
      sumIter(memo.blockGiven ? block!(i) : i, memo);
    },
    () => enumSumValue(memo),
  );
}

const undef = Symbol("Qundef");

interface InjectMemo<T> {
  v1: unknown;
  block: ((memo: unknown, i: T) => unknown) | undefined;
  op: unknown;
}

/** `inject_i` (`vendor/ruby/v3.3.11/enum.c:775`). */
function injectI<T>(i: T, memo: InjectMemo<T>): void {
  if (memo.v1 === undef) {
    memo.v1 = i;
  } else {
    memo.v1 = memo.block!(memo.v1, i);
  }
}

/** `inject_op_i` (`vendor/ruby/v3.3.11/enum.c:791`). */
function injectOpI<T>(i: T, memo: InjectMemo<T>): void {
  const name = memo.op;
  if (memo.v1 === undef) {
    memo.v1 = i;
  } else if (isSymbol(name)) {
    memo.v1 = rbFSend(memo.v1, name, i);
  } else {
    memo.v1 = rbFSend(memo.v1, name, i);
  }
}

/** `ary_inject_op` (`vendor/ruby/v3.3.11/enum.c:815`). */
function aryInjectOp(ary: readonly unknown[], init: unknown, op: string): unknown {
  let v: unknown;
  let i: number;

  if (ary.length === 0) return init === undef ? null : init;

  if (init === undef) {
    v = ary[0];
    i = 1;
    if (ary.length === 1) return v;
  } else {
    v = init;
    i = 0;
  }

  if (symbolToS(op) === "+") {
    if (rbIntegerTypeP(v)) {
      for (; i < ary.length; i++) {
        const e = ary[i];
        if (!rbIntegerTypeP(e)) break;
        v = numericPlus(v, e);
      }
    }
  }
  for (; i < ary.length; i++) {
    v = rbFSend(v, op, ary[i]);
  }
  return v;
}

/**
 * Mirrors: Ruby's Enumerable#reduce — `vendor/ruby/v3.3.11/enum.c:1005` `enum_inject`,
 * bound as `reduce` at `:5085`. The receiver is the first argument, and the
 * block is the trailing function argument. `rb_check_id` turns a String naming a method into its Symbol,
 * which every String here does; `rb_warning("given block not used")` prints
 * only under `$VERBOSE`.
 * Unported: the `rb_method_basic_definition_p` checks on `each` (`:1044`) and
 * on `Integer#+` (`:836`), which ask whether a core method was redefined.
 * @noRailsEquivalent PERMANENT
 */
export function reduce<T, E = unknown>(
  obj: Iterable<T> | Each<T, E>,
  ...argv: unknown[]
): Enumerated<E, unknown> {
  const block =
    typeof argv[argv.length - 1] === "function"
      ? (argv.pop() as (memo: unknown, i: T) => unknown)
      : undefined;
  let init: unknown;
  let op: unknown;
  let iter: (i: T, memo: InjectMemo<T>) => void = injectI;

  if (block !== undefined) {
    checkArity(argv.length, 0, 2);
  } else {
    checkArity(argv.length, 1, 2);
  }
  [init, op] = argv;

  switch (argv.length) {
    case 0:
      init = undef;
      break;
    case 1:
      if (block !== undefined) {
        break;
      }
      op = typeof init === "string" ? stringToSym(init) : init;
      init = undef;
      iter = injectOpI;
      break;
    case 2:
      if (typeof op === "string") op = stringToSym(op);
      iter = injectOpI;
      break;
  }

  if (iter === injectOpI && isSymbol(op) && Array.isArray(obj)) {
    return aryInjectOp(obj, init, op) as Enumerated<E, unknown>;
  }

  const memo: InjectMemo<T> = { v1: init, block, op };
  return rbBlockCall(
    obj,
    (i) => iter(i, memo),
    () => (memo.v1 === undef ? null : memo.v1),
  );
}

/**
 * Ruby's `Enumerable` (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`) as
 * a class module: `include(Klass, Enumerable)` copies its prototype members
 * onto `Klass`, and `new Enumerable(xs)` wraps any Array, Set, Map, generator
 * or `each`-answerer, so `new Enumerable(xs).partition(fn)` is Ruby's
 * `xs.partition(&fn)`. Every member is the free function of the same name over
 * `this`, and one answering a collection answers an Array or `Hash`.
 * @noRailsEquivalent PERMANENT
 */
export class Enumerable<T = unknown, E = unknown> {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  declare each: (block: (i: T) => void) => E;

  /** @noRailsEquivalent PERMANENT */
  declare select: Enumerable["findAll"];

  /** @noRailsEquivalent PERMANENT */
  constructor(obj: Iterable<T> | Each<T, E>) {
    Object.defineProperty(this, "each", {
      value: (block: (i: T) => void): E => {
        if (typeof (obj as Partial<Each<T, E>>).each === "function") {
          return (obj as Each<T, E>).each(block);
        }
        for (const i of obj as Iterable<T>) block(i);
        return obj as unknown as E;
      },
    });
  }

  find<T, E = unknown>(this: Each<T, E>, ...argv: unknown[]) {
    return find(this, ...argv);
  }

  /** @noRailsEquivalent PERMANENT */
  findAll<T, E = unknown>(this: Each<T, E>, block?: (i: T) => unknown): Enumerated<E, T[]> {
    return enumFindAll(this, block);
  }

  map<T, R, E = unknown>(this: Each<T, E>, block?: (i: T) => R) {
    return map(this, block);
  }

  groupBy<T, K, E = unknown>(this: Each<T, E>, block?: (i: T) => K) {
    return groupBy(this, block);
  }

  partition<T, E = unknown>(this: Each<T, E>, block?: (i: T) => unknown) {
    return block ? partition(this, block) : partition(this);
  }

  tally<T, E = unknown>(this: Each<T, E>) {
    return tally(this);
  }

  reject<T, E = unknown>(this: Each<T, E>, block?: (i: T) => unknown) {
    return reject(this, block);
  }

  filterMap<T, R, E = unknown>(this: Each<T, E>, block: (i: T) => R | false | null | undefined) {
    return filterMap(this, block);
  }

  first<T, E = unknown>(this: Each<T, E>, n?: number): Enumerated<E, T | null | T[]> {
    return n === undefined ? first(this) : first(this, n);
  }

  drop<T, E = unknown>(this: Each<T, E>, n: number) {
    return drop(this, n);
  }

  take<T, E = unknown>(this: Each<T, E>, n: number) {
    return take(this, n);
  }

  takeWhile<T, E = unknown>(this: Each<T, E>, block: (i: T) => unknown) {
    return takeWhile(this, block);
  }

  eachSlice<T, E = unknown>(this: Each<T, E>, n: number, block?: (slice: T[]) => unknown) {
    return block ? eachSlice(this, n, block) : eachSlice(this, n);
  }

  sortBy<T, E = unknown>(this: Each<T, E>, block?: (i: T) => unknown) {
    return sortBy(this, block);
  }

  isAll<T, E = unknown>(this: Each<T, E>, ...args: unknown[]) {
    return isAll(this, ...args);
  }

  isAny<T, E = unknown>(this: Each<T, E>, ...args: unknown[]) {
    return isAny(this, ...args);
  }

  isOne<T, E = unknown>(this: Each<T, E>, ...args: unknown[]) {
    return isOne(this, ...args);
  }

  isNone<T, E = unknown>(this: Each<T, E>, ...args: unknown[]) {
    return isNone(this, ...args);
  }

  isInclude<T, E = unknown>(this: Each<T, E>, val: unknown) {
    return isInclude(this, val);
  }

  sum<T, E = unknown>(this: Each<T, E>, ...args: unknown[]) {
    return sum(this, ...args);
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](this: Each<T, E>): IterableIterator<T> {
    return iterator.call(this) as IterableIterator<T>;
  }
}

/** `select` is `enum_find_all` under a second name (`vendor/ruby/v3.3.11/enum.c:5076`). */
Object.defineProperty(Enumerable.prototype, "select", {
  value: Enumerable.prototype.findAll,
  writable: true,
  configurable: true,
});

/** @noRailsEquivalent PERMANENT */
export interface AsyncEach<T> {
  each(): AsyncIterable<T>;
  each(block: (i: T) => unknown): PromiseLike<unknown>;
}

/** @noRailsEquivalent PERMANENT */
export interface AsyncEnumerator<T> extends AsyncEach<T> {
  toA(): Promise<T[]>;
  first(): Promise<T | null>;
  first(n: number): Promise<T[]>;
}

/**
 * `Enumerable` (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`) for a class
 * whose `each` awaits: every member awaits `each`, and `each` awaits the block
 * before it yields the next element.
 * @noRailsEquivalent PERMANENT
 */
export const AsyncEnumerable = {
  /**
   * Mirrors: Ruby's Enumerable#to_a — `vendor/ruby/v3.3.11/enum.c:711` `enum_to_a`.
   * @noRailsEquivalent PERMANENT
   */
  toA<T>(this: AsyncEach<T>): Promise<T[]> {
    return enumToA(this as unknown as Each<T, Promise<unknown>>);
  },

  /**
   * Mirrors: Ruby's Enumerable#sum — `vendor/ruby/v3.3.11/enum.c:4753` `enum_sum`, awaiting
   * the block's result before it is added (`sum_iter`'s `rb_yield`, `:4645`).
   * @noRailsEquivalent PERMANENT
   */
  async sum<T>(this: AsyncEach<T>, ...args: unknown[]): Promise<unknown> {
    const [memo, block] = enumSumMemo<T>(args);
    await this.each(async (i) => {
      sumIter(memo.blockGiven ? await block!(i) : i, memo);
    });
    return enumSumValue(memo);
  },

  first: Enumerable.prototype.first,

  /**
   * Mirrors: Ruby's Enumerable#reverse_each — `vendor/ruby/v3.3.11/enum.c:3006`
   * `enum_reverse_each`: `to_a`, then the block over it from the last element.
   * With no block it answers the enumerator `RETURN_SIZED_ENUMERATOR` builds.
   * @noRailsEquivalent PERMANENT
   */
  reverseEach<T>(
    this: AsyncEach<T>,
    block?: (i: T) => unknown,
  ): AsyncEnumerator<T> | Promise<unknown> {
    const toA = (): Promise<T[]> => AsyncEnumerable.toA.call(this) as Promise<T[]>;
    async function* reverseEach(): AsyncGenerator<T> {
      const ary = await toA();
      let len = ary.length;
      while (len--) yield ary[len];
    }
    const each = async (block: (i: T) => unknown): Promise<unknown> => {
      for await (const i of reverseEach()) await block(i);
      return this;
    };
    if (!block) {
      return Object.assign(Object.create(AsyncEnumerable), {
        each: (block?: (i: T) => unknown) => (block ? each(block) : reverseEach()),
      });
    }
    return each(block);
  },

  /** @noRailsEquivalent PERMANENT */
  [Symbol.asyncIterator]<T>(this: AsyncEach<T>): AsyncIterator<T> {
    return this.each()[Symbol.asyncIterator]();
  },
};
