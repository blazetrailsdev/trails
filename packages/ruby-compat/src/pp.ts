import { rbEnsure } from "./ensure.js";
import { STDOUT } from "./io.js";
import { SystemCallError } from "./errno.js";
import { NoMethodError } from "./no-method-error.js";
import { isPlainHash, rbAnyToS, rbFSend, rbInspect } from "./object.js";
import { PrettyPrint, type PrettyPrintOutput } from "./pretty-print.js";
import { env } from "./process-adapter.js";
import { rbStrToI } from "./string/convert.js";

/**
 * Ruby's `PP` (stdlib `vendor/ruby/v3.3.11/lib/pp.rb:64`), with the `PPMethods` it
 * includes (`pp.rb:141,301`). Rails defines none of it: `Core#pretty_print`,
 * `Relation#pretty_print` and `CollectionProxy#pretty_print` receive one, and
 * Rails' tests print through `PP.pp`.
 *
 * `obj.pretty_print(q)` and `obj.pretty_print_cycle(q)` dispatch to the
 * receiver's own method, else to `Array`'s (`pp.rb:370,378`) or `Hash`'s
 * (`pp.rb:384,388`), else to `PP::ObjectMixin`'s (`pp.rb:321,338`).
 * `ObjectMixin#pretty_print` is its `q.text self.inspect` arm alone: every
 * other value prints as {@link rbInspect} renders it, and `pp_object`
 * (`pp.rb:269`), which lists the instance variables of an object with no
 * `inspect` of its own, is not ported
 * (story `pp-object-mixin-pretty-print-ports-pp-object`).
 *
 * `guard_inspect_key` keeps its table in `Thread.current[:__recursive_key__]`
 * (`pp.rb:145-162`). One JS thread runs many in-flight prints, so the table is
 * held by the printer instead.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `PP` (`vendor/ruby/v3.3.11/lib/pp.rb:64`).
 */
export class PP extends PrettyPrint {
  /** @noRailsEquivalent PERMANENT — `PP.sharing_detection` (`vendor/ruby/v3.3.11/lib/pp.rb:137`). */
  static sharingDetection = false;

  private recursiveKey = new Map<unknown, true>();

  /** @noRailsEquivalent PERMANENT — `PP.width_for` (`vendor/ruby/v3.3.11/lib/pp.rb:78`). */
  static widthFor(out: PrettyPrintOutput): number {
    let width: number | undefined;
    try {
      [, width] = rbFSend(out, "winsize") as [number, number];
    } catch (e) {
      if (!(e instanceof NoMethodError || e instanceof SystemCallError)) throw e;
    }
    const columns = env.COLUMNS != null ? Number(rbStrToI(env.COLUMNS)) : 0;
    return (width ?? (columns !== 0 ? columns : 80)) - 1;
  }

  /** @noRailsEquivalent PERMANENT — `PP.pp` (`vendor/ruby/v3.3.11/lib/pp.rb:95`). */
  static async pp<O extends PrettyPrintOutput>(
    obj: unknown,
    out: O = STDOUT as unknown as O,
    width = PP.widthFor(out),
  ): Promise<O> {
    const q = new PP(out, width);
    await q.guardInspectKey(() => q.pp(obj));
    q.flush();
    out.write("\n");
    return out;
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#guard_inspect_key` (`vendor/ruby/v3.3.11/lib/pp.rb:145`). */
  guardInspectKey<T>(block: () => T): T {
    const save = this.recursiveKey;
    this.recursiveKey = new Map();
    return rbEnsure(block, () => {
      this.recursiveKey = save;
    });
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#check_inspect_key` (`vendor/ruby/v3.3.11/lib/pp.rb:167`). */
  checkInspectKey(id: unknown): boolean {
    return this.recursiveKey.has(id);
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#push_inspect_key` (`vendor/ruby/v3.3.11/lib/pp.rb:175`). */
  pushInspectKey(id: unknown): void {
    this.recursiveKey.set(id, true);
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#pop_inspect_key` (`vendor/ruby/v3.3.11/lib/pp.rb:180`). */
  popInspectKey(id: unknown): void {
    this.recursiveKey.delete(id);
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#pp` (`vendor/ruby/v3.3.11/lib/pp.rb:189`). */
  pp(obj: unknown): void | Promise<void> {
    if (isDelegator(obj)) obj = obj.__getobj__();

    if (this.checkInspectKey(obj)) {
      return this.group(0, "", "", () => prettyPrintCycle(obj, this));
    }

    this.pushInspectKey(obj);
    return rbEnsure(
      () => this.group(0, "", "", () => prettyPrint(obj, this)),
      () => {
        if (!PP.sharingDetection) this.popInspectKey(obj);
      },
    );
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#object_address_group` (`vendor/ruby/v3.3.11/lib/pp.rb:216`). */
  objectAddressGroup<T extends void | Promise<void>>(obj: object, block: () => T): T {
    const str = rbAnyToS(obj).replace(/>$/, "");
    return this.group(1, str, ">", block);
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#comma_breakable` (`vendor/ruby/v3.3.11/lib/pp.rb:226`). */
  commaBreakable(): void {
    this.text(",");
    this.breakable();
  }

  /**
   * `list.__send__(iter_method)` is the list's own iteration: a Hash is
   * handed over as its pairs, which is `each_pair`.
   *
   * @noRailsEquivalent PERMANENT — `PPMethods#seplist` (`vendor/ruby/v3.3.11/lib/pp.rb:255`).
   */
  seplist<V>(
    list: Iterable<V>,
    sep: (() => void) | null = null,
    block: (v: V) => void | Promise<void>,
  ): void | Promise<void> {
    sep ??= () => this.commaBreakable();
    let first = true;
    const each = list[Symbol.iterator]();
    const iterate = (): void | Promise<void> => {
      for (let v = each.next(); !v.done; v = each.next()) {
        if (first) {
          first = false;
        } else {
          sep();
        }
        const yielded = block(v.value);
        if (yielded instanceof Promise) return yielded.then(iterate);
      }
    };
    return iterate();
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#pp_hash` (`vendor/ruby/v3.3.11/lib/pp.rb:285`). */
  ppHash(obj: Record<string, unknown> | Map<unknown, unknown>): void | Promise<void> {
    return this.group(1, "{", "}", () =>
      this.seplist(obj instanceof Map ? obj : Object.entries(obj), null, ([k, v]) =>
        this.group(0, "", "", () => {
          const key = this.pp(k);
          const value = () => {
            this.text("=>");
            return this.group(1, "", "", () => {
              this.breakable("");
              return this.pp(v);
            });
          };
          return key instanceof Promise ? key.then(value) : value();
        }),
      ),
    );
  }
}

function isDelegator(obj: unknown): obj is { __getobj__(): unknown } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    (obj as Record<symbol, unknown>)[Symbol.for("@blazetrails/ruby-compat:delegateClass")] === true
  );
}

type PrettyPrintable = {
  prettyPrint?(q: PP): void | Promise<void>;
  prettyPrintCycle?(q: PP): void | Promise<void>;
};

function prettyPrint(obj: unknown, q: PP): void | Promise<void> {
  if (typeof (obj as PrettyPrintable | null)?.prettyPrint === "function") {
    return (obj as Required<PrettyPrintable>).prettyPrint(q);
  }
  if (Array.isArray(obj)) {
    return q.group(1, "[", "]", () => q.seplist(obj, null, (v) => q.pp(v)));
  }
  if (isPlainHash(obj) || obj instanceof Map) return q.ppHash(obj);
  q.text(rbInspect(obj));
}

function prettyPrintCycle(obj: unknown, q: PP): void | Promise<void> {
  if (typeof (obj as PrettyPrintable | null)?.prettyPrintCycle === "function") {
    return (obj as Required<PrettyPrintable>).prettyPrintCycle(q);
  }
  if (Array.isArray(obj)) {
    q.text(obj.length === 0 ? "[]" : "[...]");
    return;
  }
  if (isPlainHash(obj) || obj instanceof Map) {
    q.text((obj instanceof Map ? obj.size : Object.keys(obj).length) === 0 ? "{}" : "{...}");
    return;
  }
  return q.objectAddressGroup(obj as object, () => {
    q.breakable();
    q.text("...");
  });
}
