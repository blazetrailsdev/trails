import { classModule } from "@blazetrails/ruby-compat/class-module";
import { inherited } from "@blazetrails/ruby-compat/include";
import { setClassDefinedHook } from "@blazetrails/ruby-compat/load";
import { ObjectSpace } from "@blazetrails/ruby-compat/object-space";

export type AnyClass = abstract new (...args: never) => unknown;

const _subclassMap = new globalThis.WeakMap<AnyClass, DescendantsTracker.WeakSet<AnyClass>>();
let _clearDisabled = false;

export const ReloadedClassesFiltering = {
  get subclasses(): AnyClass[] {
    return DescendantsTracker.rejectBang(
      _subclassMap.get(this as unknown as AnyClass)?.toA() ?? [],
    );
  },

  get descendants(): AnyClass[] {
    const subclasses = this.subclasses;
    return DescendantsTracker.rejectBang(
      subclasses.concat(
        subclasses.flatMap(
          (klass) => (klass as AnyClass & { descendants: AnyClass[] }).descendants,
        ),
      ),
    );
  },
};

export class WeakSet<T extends object> extends ObjectSpace.WeakMap<T, boolean> {
  toA(): T[] {
    return this.keys();
  }

  append(object: T): void {
    this.set(object, true);
  }
}

let _excludedDescendants: WeakSet<AnyClass> | null = new WeakSet<AnyClass>();

export function registerSubclass(parent: AnyClass, child: AnyClass): void {
  if (!_subclassMap.has(parent)) _subclassMap.set(parent, new WeakSet<AnyClass>());
  const subs = _subclassMap.get(parent)!;
  if (subs.isInclude(child)) return;
  subs.append(child);
  if (inherited in parent) {
    (parent as unknown as Record<symbol, (subclass: AnyClass) => void>)[inherited](child);
  }
}

export function subclasses(klass: AnyClass): AnyClass[] {
  const subs = _subclassMap.get(klass)?.toA() ?? [];
  return rejectBang(subs);
}

export function descendants(klass: AnyClass): AnyClass[] {
  const subs = subclasses(klass);
  return [...subs, ...subs.flatMap((s) => descendants(s))];
}

export function disableClearBang(): void {
  if (!_clearDisabled) {
    _clearDisabled = true;
    _excludedDescendants = null;
  }
}

export function clear(classes: Iterable<AnyClass>): void {
  if (_clearDisabled) {
    throw new Error(
      "DescendantsTracker.clear was disabled because config.enable_reloading is false",
    );
  }
  for (const klass of classes) {
    _excludedDescendants!.append(klass);
    for (const descendant of descendants(klass)) {
      _excludedDescendants!.append(descendant);
    }
  }
}

export function rejectBang(classes: AnyClass[]): AnyClass[] {
  if (_excludedDescendants) {
    for (let i = classes.length - 1; i >= 0; i--) {
      if (_excludedDescendants.isInclude(classes[i])) classes.splice(i, 1);
    }
  }
  return classes;
}

type WeakSetInstance<T extends object> = WeakSet<T>;

export declare namespace DescendantsTracker {
  export type WeakSet<T extends object> = WeakSetInstance<T>;
}

export class DescendantsTracker {
  static readonly [classModule] = true;
  static WeakSet = WeakSet;
  static registerSubclass = registerSubclass;
  static subclasses = subclasses;
  static descendants = descendants;
  static disableClearBang = disableClearBang;
  static clear = clear;
  static rejectBang = rejectBang;

  get descendants(): AnyClass[] {
    const subclasses = DescendantsTracker.rejectBang(
      DescendantsTracker.subclasses(this as unknown as AnyClass),
    );
    return subclasses.concat(
      subclasses.flatMap((klass) => (klass as unknown as { descendants: AnyClass[] }).descendants),
    );
  }
}

setClassDefinedHook((superclass, klass) =>
  registerSubclass(superclass as AnyClass, klass as AnyClass),
);

export { DescendantsTracker as default };
