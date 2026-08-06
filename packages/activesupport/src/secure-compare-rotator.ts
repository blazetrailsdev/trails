import { SecurityUtils } from "./security-utils.js";

export class InvalidMatch extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InvalidMatch";
  }
}

/**
 * = Secure Compare Rotator
 *
 * The SecureCompareRotator is a wrapper around SecurityUtils.secureCompare
 * and allows you to rotate a previously defined value to a new one.
 *
 * It can be used as follow:
 *
 *   const rotator = new SecureCompareRotator("new_production_value");
 *   rotator.rotate("previous_production_value");
 *   rotator.secureCompareBang("previous_production_value");
 *
 * One real use case example would be to rotate a basic auth credentials.
 *
 * Mirrors: ActiveSupport::SecureCompareRotator (secure_compare_rotator.rb:32-56).
 * Ruby's `include SecurityUtils` (:33) makes `secure_compare` an instance
 * method; trails' SecurityUtils is a statics-only class, so the calls go
 * through it by name.
 */
export class SecureCompareRotator {
  private value: string;
  private rotateValues: string[];
  private onRotation: (() => void) | null;

  constructor(value: string, { onRotation = null }: { onRotation?: (() => void) | null } = {}) {
    this.value = value;
    this.rotateValues = [];
    this.onRotation = onRotation;
  }

  rotate(previousValue: string): void {
    this.rotateValues.push(previousValue);
  }

  secureCompareBang(
    otherValue: string,
    options: { onRotation?: (() => void) | null } = {},
  ): boolean {
    // Ruby's `on_rotation: @on_rotation` default only applies when the kwarg is
    // absent, so an explicitly-passed nil must not fall back to the memo.
    const onRotation = "onRotation" in options ? options.onRotation : this.onRotation;

    if (SecurityUtils.secureCompare(this.value, otherValue)) {
      return true;
    } else if (this.rotateValues.some((value) => SecurityUtils.secureCompare(value, otherValue))) {
      onRotation?.();
      return true;
    } else {
      throw new InvalidMatch();
    }
  }
}
