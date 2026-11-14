import { sql } from "@blazetrails/arel";
import { Kernel, Range } from "@blazetrails/ruby-compat";
import { SolidCache } from "../../solid-cache.js";

export class Estimate {
  readonly samples: number;
  maxRecords!: number;
  private _outlierSizeAndCutoff?: Promise<[number, number, unknown]>;
  private _nonOutlierEstimatedSize?: number;
  private _sampledFraction?: number;
  private _sampledNonOutlierSize?: number;
  private _sampleRangeSize?: bigint;

  protected constructor({ samples }: { samples: number }) {
    this.samples = samples;
  }

  static async new({ samples }: { samples: number }): Promise<Estimate> {
    const estimate = new Estimate({ samples });
    estimate.maxRecords ??= Number(await SolidCache.Entry!.idRange());
    return estimate;
  }

  async size(): Promise<number> {
    return (await this.outliersSize()) + (await this.nonOutlierEstimatedSize());
  }

  async isExact(): Promise<boolean> {
    return (await this.outliersCount()) < this.samples || (await this.sampledFraction()) === 1;
  }

  /** @internal */
  private async outliersSize(): Promise<number> {
    return (await this.outliersSizeCountAndCutoff())[0];
  }

  /** @internal */
  private async outliersCount(): Promise<number> {
    return (await this.outliersSizeCountAndCutoff())[1];
  }

  /** @internal */
  private async outliersCutoff(): Promise<unknown> {
    return (await this.outliersSizeCountAndCutoff())[2];
  }

  /** @internal */
  private outliersSizeCountAndCutoff(): Promise<[number, number, unknown]> {
    return (this._outlierSizeAndCutoff ??= Promise.resolve(
      SolidCache.Entry!.uncached(async () => {
        const [sum, count, min] = (await SolidCache.Entry!.largestByteSizes(this.samples).pick(
          sql("sum(byte_size), count(*), min(byte_size)"),
        )) as [unknown, unknown, unknown];
        return sum != null ? [Number(sum), Number(count), min] : [0, 0, null];
      }),
    ));
  }

  /** @internal */
  private async nonOutlierEstimatedSize(): Promise<number> {
    const sampledFraction = await this.sampledFraction();
    return (this._nonOutlierEstimatedSize ??=
      sampledFraction === 0
        ? 0
        : Math.round((await this.sampledNonOutlierSize()) / sampledFraction));
  }

  /** @internal */
  private async sampledFraction(): Promise<number> {
    const maxRecords = this.maxRecords;
    return (this._sampledFraction ??=
      maxRecords <= this.samples ? 0 : Math.min(this.samples / (maxRecords - this.samples), 1));
  }

  /** @internal */
  private async sampledNonOutlierSize(): Promise<number> {
    if (this._sampledNonOutlierSize != null) return this._sampledNonOutlierSize;
    const sampleRange = await this.sampleRange();
    const outliersCutoff = await this.outliersCutoff();
    return (this._sampledNonOutlierSize = Number(
      await SolidCache.Entry!.uncached(() =>
        (
          SolidCache.Entry!.inKeyHashRange(sampleRange) as unknown as NonNullable<
            typeof SolidCache.Entry
          >
        )
          .upToByteSize(outliersCutoff)
          .sum("byte_size"),
      ),
    ));
  }

  /** @internal */
  private async sampleRange(): Promise<Range<bigint>> {
    if ((await this.sampledFraction()) === 1) {
      return this.keyHashRange();
    } else {
      const sampleRangeSize = await this.sampleRangeSize();
      const begin = this.keyHashRange().begin as bigint;
      const end = this.keyHashRange().end as bigint;
      const start = begin + (Kernel.rand(end - sampleRangeSize - begin + 1n) as bigint);
      return new Range(start, start + sampleRangeSize);
    }
  }

  /** @internal */
  private keyHashRange(): Range<bigint> {
    return SolidCache.Entry!.KEY_HASH_ID_RANGE;
  }

  /** @internal */
  private async sampleRangeSize(): Promise<bigint> {
    const size = (this.keyHashRange().end as bigint) - (this.keyHashRange().begin as bigint) + 1n;
    return (this._sampleRangeSize ??= BigInt(
      Math.trunc(Number(size) * (await this.sampledFraction())),
    ));
  }
}
