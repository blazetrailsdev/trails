import { rbEnsure } from "./ensure.js";
import { STDOUT } from "./io.js";
import { rbAnyToS, rbInspect, rbObjRespondTo } from "./object.js";
import { PrettyPrint, type PrettyPrintOutput } from "./pretty-print.js";
import { env } from "./process-adapter.js";
import { rbStrToI } from "./string/convert.js";

/**
 * Ruby's `PP` (stdlib `vendor/ruby/v3.3.11/lib/pp.rb:64`), with the `PPMethods` it
 * includes (`pp.rb:141,301`). Rails defines none of it: `Core#pretty_print`,
 * `Relation#pretty_print` and `CollectionProxy#pretty_print` receive one, and
 * Rails' tests print through `PP.pp`.
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
    if (rbObjRespondTo(out, "winsize")) {
      [, width] = (out as unknown as { winsize(): [number, number] }).winsize();
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
  async pp(obj: unknown): Promise<void> {
    if (isDelegator(obj)) obj = obj.__getobj__();

    if (this.checkInspectKey(obj)) {
      await this.group(0, "", "", () => prettyPrintCycle(obj, this));
      return;
    }

    this.pushInspectKey(obj);
    await rbEnsure(
      () => this.group(0, "", "", () => prettyPrint(obj, this)),
      () => {
        if (!PP.sharingDetection) this.popInspectKey(obj);
      },
    );
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#object_address_group` (`vendor/ruby/v3.3.11/lib/pp.rb:216`). */
  objectAddressGroup(obj: object, block: () => void | Promise<void>): Promise<void> {
    const str = rbAnyToS(obj).replace(/>$/, "");
    return this.group(1, str, ">", block);
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#comma_breakable` (`vendor/ruby/v3.3.11/lib/pp.rb:226`). */
  commaBreakable(): void {
    this.text(",");
    this.breakable();
  }

  /** @noRailsEquivalent PERMANENT — `PPMethods#seplist` (`vendor/ruby/v3.3.11/lib/pp.rb:255`). */
  async seplist<V>(
    list: Iterable<V>,
    sep: (() => void) | null,
    block: (v: V) => void | Promise<void>,
  ): Promise<void> {
    sep ??= () => this.commaBreakable();
    let first = true;
    for (const v of list) {
      if (first) {
        first = false;
      } else {
        sep();
      }
      await block(v);
    }
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

/**
 * `obj.pretty_print(q)`: the receiver's own method, else `Array#pretty_print`
 * (`vendor/ruby/v3.3.11/lib/pp.rb:370`), else `PP::ObjectMixin#pretty_print`
 * (`pp.rb:321`), whose arm for an object with an `inspect` of its own is
 * `q.text self.inspect`.
 */
function prettyPrint(obj: unknown, q: PP): void | Promise<void> {
  if (typeof (obj as PrettyPrintable | null)?.prettyPrint === "function") {
    return (obj as Required<PrettyPrintable>).prettyPrint(q);
  }
  if (Array.isArray(obj)) {
    return q.group(1, "[", "]", () => q.seplist(obj, null, (v) => q.pp(v)));
  }
  q.text(rbInspect(obj));
}

/**
 * `obj.pretty_print_cycle(q)`: the receiver's own method, else
 * `Array#pretty_print_cycle` (`vendor/ruby/v3.3.11/lib/pp.rb:378`), else
 * `PP::ObjectMixin#pretty_print_cycle` (`pp.rb:338`).
 */
function prettyPrintCycle(obj: unknown, q: PP): void | Promise<void> {
  if (typeof (obj as PrettyPrintable | null)?.prettyPrintCycle === "function") {
    return (obj as Required<PrettyPrintable>).prettyPrintCycle(q);
  }
  if (Array.isArray(obj)) {
    q.text(obj.length === 0 ? "[]" : "[...]");
    return;
  }
  return q.objectAddressGroup(obj as object, () => {
    q.breakable();
    q.text("...");
  });
}
