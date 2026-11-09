import "../../../constants.trails-benchmark-benchmark-generator.generated.js";
import { NamedBase } from "../../named-base.js";

export class BenchmarkGenerator extends NamedBase {
  static {
    this.argument("reports", { type: "array", default: ["before", "after"] });
    this.methodAdded("generateLayout");
  }

  declare reports: string[];

  /** @missingRailsArgs template — PERMANENT */
  async generateLayout(): Promise<void> {
    await this.template("benchmark.ts", `script/benchmarks/${this.fileName}${this.ext()}`);
  }
}
