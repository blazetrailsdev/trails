import { include } from "@blazetrails/ruby-compat/include";
import { SecurityUtils } from "./security-utils.js";

export class InvalidMatch extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InvalidMatch";
  }
}

export class SecureCompareRotator {
  static toString(): string {
    return "ActiveSupport::SecureCompareRotator";
  }

  declare secureCompare: SecurityUtils["secureCompare"];
  declare fixedLengthSecureCompare: SecurityUtils["fixedLengthSecureCompare"];

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
    const onRotation = "onRotation" in options ? options.onRotation : this.onRotation;

    if (this.secureCompare(this.value, otherValue)) {
      return true;
    } else if (this.rotateValues.some((value) => this.secureCompare(value, otherValue))) {
      onRotation?.();
      return true;
    } else {
      throw new InvalidMatch();
    }
  }
}

include(SecureCompareRotator, SecurityUtils);
