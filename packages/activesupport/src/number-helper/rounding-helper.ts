export class RoundingHelper {
  private precision: number;
  private significant: boolean;

  constructor(options: { precision?: number; significant?: boolean } = {}) {
    this.precision = options.precision ?? 3;
    this.significant = options.significant ?? false;
  }

  round(number: number): number {
    if (this.significant) {
      return this.roundSignificant(number);
    }
    return this.roundPrecision(number);
  }

  private rubyRound(value: number): number {
    if (value === 0) return 0;
    const adjusted = value + (value >= 0 ? Number.EPSILON : -Number.EPSILON);
    if (adjusted > 0) {
      return Math.floor(adjusted + 0.5);
    }
    return -Math.floor(-adjusted + 0.5);
  }

  private roundPrecision(number: number): number {
    if (this.precision === 0) return this.rubyRound(number);
    const factor = Math.pow(10, this.precision);
    return this.rubyRound(number * factor) / factor;
  }

  private roundSignificant(number: number): number {
    if (number === 0) return 0;
    if (this.precision === 0) return this.rubyRound(number);
    const d = Math.ceil(Math.log10(Math.abs(number)));
    const power = this.precision - d;
    const magnitude = Math.pow(10, power);
    return this.rubyRound(number * magnitude) / magnitude;
  }
}
