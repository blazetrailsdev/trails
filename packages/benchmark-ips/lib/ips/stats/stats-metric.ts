export interface StatsMetricHost {
  error: number;
  centralTendency(): number;
}

export const StatsMetric = {
  errorPercentage(this: StatsMetricHost): number {
    return 100.0 * (this.error / this.centralTendency());
  },

  isOverlaps(this: StatsMetricHost, baseline: StatsMetricHost): boolean {
    const baselineLow = baseline.centralTendency() - baseline.error;
    const baselineHigh = baseline.centralTendency() + baseline.error;
    const myHigh = this.centralTendency() + this.error;
    const myLow = this.centralTendency() - this.error;
    return myHigh > baselineLow && myLow < baselineHigh;
  },
};
