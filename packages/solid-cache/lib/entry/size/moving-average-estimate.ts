import { isPresent } from "@blazetrails/activesupport";
import { SolidCache } from "../../solid-cache.js";
import { Estimate } from "./estimate.js";

const decoder = new TextDecoder();

export class MovingAverageEstimate {
  static readonly ESTIMATES_KEY = "__solid_cache_entry_size_moving_average_estimates";
  static readonly MAX_RETAINED_ESTIMATES = 50;
  static readonly TARGET_SAMPLED_FRACTION = 0.0005;

  readonly samples: number;
  size!: number;
  /** @internal */
  private estimate!: Estimate;

  protected constructor({ samples }: { samples: number }) {
    this.samples = samples;
  }

  static async new({ samples }: { samples: number }): Promise<MovingAverageEstimate> {
    const self = new MovingAverageEstimate({ samples });
    self.estimate = await Estimate.new({ samples: samples });
    const values = await self.latestValues();
    self.size = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    await self.writeValues(values);
    return self;
  }

  isExact(): Promise<boolean> {
    return this.estimate.isExact();
  }

  /** @internal */
  private async previousValues(): Promise<number[]> {
    const read = await SolidCache.Entry!.read(MovingAverageEstimate.ESTIMATES_KEY);
    const value = read instanceof Uint8Array ? decoder.decode(read) : (read as string | null);
    return isPresent(value) ? value!.split("|").map((v) => parseInt(v, 10) || 0) : [];
  }

  /** @internal */
  private latestValue(): Promise<number> {
    return this.estimate.size();
  }

  /** @internal */
  private async latestValues(): Promise<number[]> {
    return [...(await this.previousValues()), await this.latestValue()].slice(
      -(await this.retainedEstimates()),
    );
  }

  /** @internal */
  private async writeValues(values: number[]): Promise<void> {
    await SolidCache.Entry!.write(MovingAverageEstimate.ESTIMATES_KEY, values.join("|"));
  }

  /** @internal */
  private async retainedEstimates(): Promise<number> {
    return Math.min(
      await this.retainedEstimatesForTargetFraction(),
      MovingAverageEstimate.MAX_RETAINED_ESTIMATES,
    );
  }

  /** @internal */
  private async retainedEstimatesForTargetFraction(): Promise<number> {
    return (
      Math.floor(
        Math.floor(this.estimate.maxRecords / this.samples) *
          MovingAverageEstimate.TARGET_SAMPLED_FRACTION,
      ) + 1
    );
  }
}
