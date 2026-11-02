import { lessThan, type Comparable } from "@blazetrails/ruby-compat";
import { Field } from "./field.js";

export class FieldList extends Array<Field> {
  /** @noRailsEquivalent PERMANENT */
  static override get [Symbol.species](): ArrayConstructor {
    return Array;
  }

  isHasField(fieldName: unknown): boolean {
    return this.some((f) => f.isResponsibleFor(fieldName));
  }

  getField(fieldName: unknown): Field | Field[] | null {
    const fields = this.selectFields(fieldName);
    switch (fields.length) {
      case 0:
        return null;
      case 1:
        return fields[0];
      default:
        return fields;
    }
  }

  addField(field: Field): this {
    if (field.isSingular()) {
      this.replaceField(field);
    } else {
      this.insertField(field);
    }
    return this;
  }

  replaceField(field: Field): void {
    const firstOffset = this.findIndex((f) => f.isResponsibleFor(field.name));
    if (firstOffset !== -1) {
      this.deleteField(field.name);
      this.splice(firstOffset, 0, field);
    } else {
      this.insertField(field);
    }
  }

  insertField(field: Field): void {
    let [lo, hi] = [0, this.length];
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (lessThan.call(field as Comparable, this[mid])) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }

    this.splice(lo, 0, field);
  }

  deleteField(name: unknown): void {
    for (let i = this.length - 1; i >= 0; i--) {
      if (this[i].isResponsibleFor(name)) this.splice(i, 1);
    }
  }

  summary(): string {
    return this.map((f) => `<${f.name}: ${String(f.value)}>`).join(", ");
  }

  /** @internal */
  private selectFields(fieldName: unknown): Field[] {
    const fields = this.filter((f) => f.isResponsibleFor(fieldName));
    if (fields.length > 1 && this.isSingular(fieldName)) {
      return [fields.find((f) => f.errors.length === 0) ?? fields[0]];
    } else {
      return fields;
    }
  }

  /** @internal */
  private isSingular(fieldName: unknown): boolean {
    const klass = Field.fieldClassFor(fieldName);
    if (klass != null) {
      return klass.isSingular();
    } else {
      return false;
    }
  }
}
