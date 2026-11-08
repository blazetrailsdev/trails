export class Integer {
  static isMultipleOf(self: number, number: number): boolean;
  static isMultipleOf(self: bigint, number: bigint | number): boolean;
  static isMultipleOf(self: number | bigint, number: number | bigint): boolean {
    if (typeof self === "bigint" || typeof number === "bigint") {
      const selfBig = BigInt(self);
      const numberBig = BigInt(number);
      return numberBig === 0n ? selfBig === 0n : selfBig % numberBig === 0n;
    }
    return number === 0 ? self === 0 : self % number === 0;
  }
}
