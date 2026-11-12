import { Attribute, ValueType } from "@blazetrails/activemodel";
import { deepDup } from "@blazetrails/activesupport";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Substitute } from "../statement-cache.js";

type CastType = Pick<ValueType, "cast" | "serialize">;

class DelegatingType extends ValueType<unknown> {
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

function ensureType(type: CastType | null): ValueType | null {
  if (type === null) return type;
  if (type instanceof ValueType) return type;
  return new DelegatingType(type);
}

export class QueryAttribute extends Attribute {
  /** @internal */
  declare private _unboundable?: 1 | -1 | null;

  constructor(name: string | null, value: unknown, type: CastType | null) {
    super(name, value, ensureType(type));

    if (this.valueBeforeTypeCast instanceof Substitute) {
      /** @empty */
    } else if (this.type!.isSerialized()) {
      void this.valueForDatabase;
    } else if (this.type!.isMutable()) {
      this._valueBeforeTypeCast = deepDup(this.valueBeforeTypeCast);
    }
  }

  typeCast(value: unknown): unknown {
    return value;
  }

  override withCastValue(value: unknown): QueryAttribute {
    return new QueryAttribute(this.name, value, this.type);
  }

  override get valueForDatabase(): unknown {
    if (!Object.hasOwn(this, "__valueForDatabase")) {
      this.__valueForDatabase = this._valueForDatabase();
    }
    return this.__valueForDatabase;
  }

  isNil(): boolean | undefined {
    if (!(this.valueBeforeTypeCast instanceof Substitute)) {
      return (
        this.valueBeforeTypeCast == null ||
        ((rbObjRespondTo(this.type, "subtype") || rbObjRespondTo(this.type, "normalizer")) &&
          this.isSerializable() &&
          this.valueForDatabase == null)
      );
    }
  }

  isInfinite(): 1 | -1 | null | false {
    return (
      this.isInfinity(this.valueBeforeTypeCast) ||
      (this.isSerializable() && this.isInfinity(this.valueForDatabase))
    );
  }

  isUnboundable(): 1 | -1 | null | undefined {
    if (!Object.hasOwn(this, "_unboundable")) {
      void (
        this.isSerializable((value) => {
          this._unboundable = compareToZero(value);
        }) && (this._unboundable = null)
      );
    }
    return this._unboundable;
  }

  /** @internal */
  private isInfinity(value: unknown): 1 | -1 | null | false {
    return rbObjRespondTo(value, "isInfinite") && (rbFSend(value, "isInfinite") as 1 | -1 | null);
  }
}

/** @internal */
function compareToZero(value: unknown): 1 | -1 {
  if (typeof value === "bigint") return value >= 0n ? 1 : -1;
  if (typeof value === "number") return value >= 0 ? 1 : -1;
  return 1;
}
