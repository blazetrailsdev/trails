import { Module } from "@blazetrails/ruby-compat";

export type AnyClass = abstract new (...args: unknown[]) => unknown;

const _subclassMap = new globalThis.WeakMap<AnyClass, DescendantsTracker.WeakSet<AnyClass>>();
let _excludedDescendants: globalThis.WeakSet<AnyClass> | null = new globalThis.WeakSet<AnyClass>();
let _clearDisabled = false;

export const ReloadedClassesFiltering = {
  get subclasses(): AnyClass[] {
    return DescendantsTracker.rejectBang(
      _subclassMap.get(this as unknown as AnyClass)?.toArray() ?? [],
    );
  },
};

export class WeakSet<T extends object> {
  private _map = new globalThis.WeakMap<T, boolean>();
  private _refs: WeakRef<T>[] = [];
  private _addsSinceCompact = 0;

  add(object: T): void {
    if (!this._map.has(object)) {
      this._map.set(object, true);
      this._refs.push(new WeakRef(object));
      this._addsSinceCompact++;
      if (this._addsSinceCompact >= 100) {
        this._compact();
      }
    }
  }

  private _compact(): void {
    this._refs = this._refs.filter((ref) => ref.deref() !== undefined);
    this._addsSinceCompact = 0;
  }

  isInclude(object: T): boolean {
    return this._map.has(object);
  }

  delete(object: T): void {
    this._map.delete(object);
    this._refs = this._refs.filter((ref) => {
      const obj = ref.deref();
      return obj !== undefined && obj !== object;
    });
  }

  toArray(): T[] {
    const result: T[] = [];
    const alive: WeakRef<T>[] = [];
    for (const ref of this._refs) {
      const obj = ref.deref();
      if (obj !== undefined) {
        alive.push(ref);
        result.push(obj);
      }
    }
    this._refs = alive;
    return result;
  }
}

export function registerSubclass(parent: AnyClass, child: AnyClass): void {
  if (!_subclassMap.has(parent)) _subclassMap.set(parent, new WeakSet<AnyClass>());
  _subclassMap.get(parent)!.add(child);
}

export function subclasses(klass: AnyClass): AnyClass[] {
  const subs = _subclassMap.get(klass)?.toArray() ?? [];
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

export function clear(classes: AnyClass[]): void {
  if (_clearDisabled) {
    throw new Error(
      "DescendantsTracker.clear was disabled because config.enable_reloading is false",
    );
  }
  for (const klass of classes) {
    _excludedDescendants!.add(klass);
    for (const descendant of descendants(klass)) {
      _excludedDescendants!.add(descendant);
    }
  }
}

export function rejectBang(classes: AnyClass[]): AnyClass[] {
  if (_excludedDescendants) {
    for (let i = classes.length - 1; i >= 0; i--) {
      if (_excludedDescendants.has(classes[i])) classes.splice(i, 1);
    }
  }
  return classes;
}

type WeakSetInstance<T extends object> = WeakSet<T>;

export declare namespace DescendantsTracker {
  export type WeakSet<T extends object> = WeakSetInstance<T>;
}

export const DescendantsTracker = new Module() as Module & {
  WeakSet: typeof WeakSet;
  registerSubclass: typeof registerSubclass;
  subclasses: typeof subclasses;
  descendants: typeof descendants;
  disableClearBang: typeof disableClearBang;
  clear: typeof clear;
  rejectBang: typeof rejectBang;
};
DescendantsTracker.WeakSet = WeakSet;
DescendantsTracker.registerSubclass = registerSubclass;
DescendantsTracker.subclasses = subclasses;
DescendantsTracker.descendants = descendants;
DescendantsTracker.disableClearBang = disableClearBang;
DescendantsTracker.clear = clear;
DescendantsTracker.rejectBang = rejectBang;
DescendantsTracker.moduleEval((carrier) =>
  Object.defineProperty(carrier, "descendants", {
    get(this: AnyClass): AnyClass[] {
      const subclasses = DescendantsTracker.rejectBang(DescendantsTracker.subclasses(this));
      return subclasses.concat(
        subclasses.flatMap(
          (klass) => (klass as unknown as { descendants: AnyClass[] }).descendants,
        ),
      );
    },
    configurable: true,
  }),
);

export { DescendantsTracker as default };
