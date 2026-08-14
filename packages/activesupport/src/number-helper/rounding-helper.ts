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

  /**
   * Rails hands `options.fetch(:round_mode, :default).to_sym` straight to
   * `BigDecimal#round` (rounding_helper.rb:16), so every mode Ruby's
   * BigDecimal understands is reachable from every number helper. This is that
   * dispatch. A Ruby Symbol option value is a `":name"` string in trails, and
   * the camelCased spelling is accepted alongside the Ruby one.
   */
  private applyRound(value: number): number {
    switch (this.roundMode.replace(/^:/, "")) {
      case "up":
        // BigDecimal ROUND_UP — away from zero, not "half up".
        return value < 0 ? Math.floor(value) : Math.ceil(value);
      case "down":
      case "truncate":
        return Math.trunc(value);
      case "ceiling":
      case "ceil":
        return Math.ceil(value);
      case "floor":
        return Math.floor(value);
      case "half_down":
      case "halfDown":
        return this.halfDownRound(value);
      case "half_even":
      case "halfEven":
      case "even":
      case "banker":
        return this.bankersRound(value);
      default:
        return this.rubyRound(value);
    }
  }

  /** BigDecimal ROUND_HALF_DOWN — ties toward zero, everything else as half-up. */
  private halfDownRound(value: number): number {
    const truncated = Math.trunc(value);
    const fraction = Math.abs(value - truncated);
    if (Math.abs(fraction - 0.5) < 1e-10) return truncated;
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
