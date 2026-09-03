export class Numeric {
  static readonly KILOBYTE = 1024;
  static readonly MEGABYTE = Numeric.KILOBYTE * 1024;
  static readonly GIGABYTE = Numeric.MEGABYTE * 1024;
  static readonly TERABYTE = Numeric.GIGABYTE * 1024;
  static readonly PETABYTE = Numeric.TERABYTE * 1024;
  static readonly EXABYTE = Numeric.PETABYTE * 1024;
  static readonly ZETTABYTE = Numeric.EXABYTE * 1024;

  static bytes(self: number): number {
    return self;
  }

  static byte(self: number): number {
    return Numeric.bytes(self);
  }

  static kilobytes(self: number): number {
    return self * Numeric.KILOBYTE;
  }

  static kilobyte(self: number): number {
    return Numeric.kilobytes(self);
  }

  static megabytes(self: number): number {
    return self * Numeric.MEGABYTE;
  }

  static megabyte(self: number): number {
    return Numeric.megabytes(self);
  }

  static gigabytes(self: number): number {
    return self * Numeric.GIGABYTE;
  }

  static gigabyte(self: number): number {
    return Numeric.gigabytes(self);
  }

  static terabytes(self: number): number {
    return self * Numeric.TERABYTE;
  }

  static terabyte(self: number): number {
    return Numeric.terabytes(self);
  }

  static petabytes(self: number): number {
    return self * Numeric.PETABYTE;
  }

  static petabyte(self: number): number {
    return Numeric.petabytes(self);
  }

  static exabytes(self: number): number {
    return self * Numeric.EXABYTE;
  }

  static exabyte(self: number): number {
    return Numeric.exabytes(self);
  }

  static zettabytes(self: number): number {
    return self * Numeric.ZETTABYTE;
  }

  static zettabyte(self: number): number {
    return Numeric.zettabytes(self);
  }
}
