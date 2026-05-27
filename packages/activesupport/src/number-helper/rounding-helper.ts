export class RoundingHelper {
  private precision: number;
  private significant: boolean;
  private roundMode: string;

  constructor(options: { precision?: number; significant?: boolean; roundMode?: string } = {}) {
    this.precision = options.precision ?? 3;
    this.significant = options.significant ?? false;
    this.roundMode = options.roundMode ?? "default";
  }

  round(number: number): number {
    if (this.significant) {
      return this.roundSignificant(number);
    }
    return this.roundPrecision(number);
  }

  private applyRound(value: number): number {
    if (this.roundMode === "halfEven" || this.roundMode === "half_even") {
      return this.bankersRound(value);
    }
    return this.rubyRound(value);
  }

  private rubyRound(value: number): number {
    if (value === 0) return 0;
    const adjusted = value + (value >= 0 ? Number.EPSILON : -Number.EPSILON);
    if (adjusted > 0) {
      return Math.floor(adjusted + 0.5);
    }
    return -Math.floor(-adjusted + 0.5);
  }

  private bankersRound(value: number): number {
    if (value === 0) return 0;
    const rounded = Math.round(value);
    const diff = Math.abs(value - Math.trunc(value));
    if (Math.abs(diff - 0.5) < 1e-10) {
      const truncated = Math.trunc(value);
      if (truncated % 2 === 0) return truncated;
      return truncated + (value > 0 ? 1 : -1);
    }
    return rounded;
  }

  private roundPrecision(number: number): number {
    if (this.precision === 0) return this.applyRound(number);
    const factor = Math.pow(10, this.precision);
    return this.applyRound(number * factor) / factor;
  }

  private roundSignificant(number: number): number {
    if (number === 0) return 0;
    if (this.precision === 0) return this.applyRound(number);
    const d = Math.ceil(Math.log10(Math.abs(number)));
    const power = this.precision - d;
    const magnitude = Math.pow(10, power);
    return this.applyRound(number * magnitude) / magnitude;
  }
}
