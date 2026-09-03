import { Attribute, Type } from "@blazetrails/activemodel";
import { Substitute } from "../statement-cache.js";

type CastType = Pick<Type, "cast" | "serialize">;

class DelegatingType extends Type<unknown> {
  readonly name = "query";
  private _delegate: CastType;

  constructor(delegate: CastType) {
    super();
    this._delegate = delegate;
  }

  cast(value: unknown): unknown {
    return this._delegate.cast(value);
  }

  override serialize(value: unknown): unknown {
    return this._delegate.serialize(value);
  }
}

function ensureType(type: CastType): Type {
  if (type instanceof Type) return type;
  return new DelegatingType(type);
}

export class QueryAttribute extends Attribute {
  /** @internal */
  private _unboundable?: 1 | -1 | false;

  constructor(name: string, value: unknown, type: CastType) {
    super(name, value, ensureType(type));
  }

  typeCast(value: unknown): unknown {
    return value;
  }

  override withCastValue(value: unknown): QueryAttribute {
    return new QueryAttribute(this.name, value, this.type!);
  }

  override get valueForDatabase(): unknown {
    return super.valueForDatabase;
  }

  protected override _valueForDatabase(): unknown {
    return this.type!.serialize(this.value);
  }

  isNil(): boolean {
    if (this.valueBeforeTypeCast instanceof Substitute) return false;
    if (this.valueBeforeTypeCast === null || this.valueBeforeTypeCast === undefined) return true;
    const type = this.type as { subtype?: unknown; normalizer?: unknown };
    const hasSubtypeOrNormalizer = type.subtype !== undefined || type.normalizer !== undefined;
    if (!hasSubtypeOrNormalizer || !this.isSerializable()) return false;
    const forDatabase = this.valueForDatabase;
    return forDatabase === null || forDatabase === undefined;
  }

  isInfinite(): 1 | -1 | false {
    return (
      isInfinity(this.valueBeforeTypeCast) ||
      (this.isSerializable() && isInfinity(this.valueForDatabase))
    );
  }

  isUnboundable(): 1 | -1 | false {
    if (this._unboundable === undefined) {
      let unboundable: 1 | -1 | false = false;
      const serializable = this.isSerializable((castValue) => {
        unboundable = compareToZero(castValue);
      });
      this._unboundable = serializable ? false : unboundable;
    }
    return this._unboundable;
  }
}

/** @internal */
function isInfinity(value: unknown): 1 | -1 | false {
  if (value === Infinity) return 1;
  if (value === -Infinity) return -1;
  if (value === null || value === undefined) return false;
  const fn = (value as { isInfinite?: unknown }).isInfinite;
  if (typeof fn !== "function") return false;
  const result = (fn as () => unknown).call(value);
  if (result === 1 || result === -1) return result;
  return false;
}

/** @internal */
function compareToZero(value: unknown): 1 | -1 {
  if (typeof value === "bigint") return value >= 0n ? 1 : -1;
  if (typeof value === "number") return value >= 0 ? 1 : -1;
  return 1;
}
