import { SerializationTypeMismatch } from "../errors.js";

type CoderLike = { dump(obj: unknown): string | null; load(payload: unknown): unknown };
type ClassLike = new (...args: unknown[]) => unknown;

/**
 * Wraps a coder (e.g. YAML, JSON) with object-class validation so that
 * serialized columns only accept instances of the declared class.
 *
 * Mirrors: ActiveRecord::Coders::ColumnSerializer
 */
export class ColumnSerializer {
  private _attrName: string;
  private _objectClass: ClassLike;
  private _coder: CoderLike;

  get objectClass(): ClassLike {
    return this._objectClass;
  }

  get coder(): CoderLike {
    return this._coder;
  }

  constructor(
    attrName: string,
    coder: CoderLike,
    objectClass: ClassLike = Object as unknown as ClassLike,
  ) {
    this._attrName = attrName;
    this._objectClass = objectClass;
    this._coder = coder;
    this.checkArityOfConstructor();
  }

  /**
   * Restore from a serialized coder representation.
   *
   * Mirrors: ActiveRecord::Coders::ColumnSerializer#init_with
   */
  initWith(coder: { attrName: string; objectClass: ClassLike; coder: CoderLike }): void {
    this._attrName = coder.attrName;
    this._objectClass = coder.objectClass;
    this._coder = coder.coder;
    this.checkArityOfConstructor();
  }

  /**
   * Mirrors: ActiveRecord::Coders::ColumnSerializer#dump
   */
  dump(object: unknown): string | null {
    if (object == null) return null;
    this.assertValidValue(object, { action: "dump" });
    return this._coder.dump(object);
  }

  /**
   * Mirrors: ActiveRecord::Coders::ColumnSerializer#load
   */
  load(payload: unknown): unknown {
    if (payload == null) {
      if (this._objectClass !== (Object as unknown)) {
        return new (this._objectClass as new () => unknown)();
      }
      return null;
    }

    let object = this._coder.load(payload);
    this.assertValidValue(object, { action: "load" });

    if (object == null && this._objectClass !== (Object as unknown)) {
      object = new (this._objectClass as new () => unknown)();
    }

    return object;
  }

  /**
   * Mirrors: ActiveRecord::Coders::ColumnSerializer#assert_valid_value
   */
  assertValidValue(object: unknown, { action }: { action: string }): void {
    if (object == null) return;
    // Object is the universal superclass — mirrors Ruby's `Object === anything`.
    if (this._objectClass === (Object as unknown)) return;
    if (!(object instanceof this._objectClass)) {
      throw new SerializationTypeMismatch(
        `can't ${action} \`${this._attrName}\`: was supposed to be a ${this._objectClass.name}, ` +
          `but was a ${(object as object).constructor?.name ?? typeof object}. -- ${String(object)}`,
      );
    }
  }

  /** @internal */
  checkArityOfConstructor(): void {
    // column_serializer.rb:53-56 — `load(nil)` is what probes the constructor,
    // since load's nil arm is `@object_class.new`. JS throws a bare TypeError
    // where Ruby raises ArgumentError, so every failure is caught.
    try {
      this.load(null);
    } catch (e: unknown) {
      throw new TypeError(
        `Cannot serialize ${this._objectClass.name}. Classes passed to \`serialize\` must have a 0 argument constructor.`,
        { cause: e },
      );
    }
  }
}
