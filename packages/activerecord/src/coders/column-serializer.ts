import { ArgumentError } from "@blazetrails/activemodel";
import { SerializationTypeMismatch } from "../errors.js";

type CoderLike = { dump(obj: unknown): string | null; load(payload: unknown): unknown };
type ClassLike = new (...args: unknown[]) => unknown;

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

  initWith(coder: { attrName: string; objectClass: ClassLike; coder: CoderLike }): void {
    this._attrName = coder.attrName;
    this._objectClass = coder.objectClass;
    this._coder = coder.coder;
  }

  dump(object: unknown): string | null {
    if (object == null) return null;
    this.assertValidValue(object, { action: "dump" });
    return this._coder.dump(object);
  }

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

  assertValidValue(object: unknown, { action }: { action: string }): void {
    if (object == null) return;
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
    try {
      this.load(null);
    } catch (e: unknown) {
      if (!(e instanceof ArgumentError)) throw e;
      throw new ArgumentError(
        `Cannot serialize ${this._objectClass.name}. Classes passed to \`serialize\` must have a 0 argument constructor.`,
      );
    }
  }
}
