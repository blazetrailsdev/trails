import "../../../constants.trails-benchmark-benchmark-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";

export class BenchmarkGenerator extends NamedBase {
  static readonly IPS_GEM_NAME = "benchmark-ips";
  static readonly IPS_GEM_USED_REGEXP = new RegExp(`"\\b${BenchmarkGenerator.IPS_GEM_NAME}\\b".*`);

  static {
    this.argument("reports", { type: "array", default: ["before", "after"] });
    this.methodAdded("generateLayout");
  }

  declare reports: string[];

  /** @missingRailsArgs template — PERMANENT */
  async generateLayout(): Promise<void> {
    if (!(await this.isIpsInstalled())) await this.addIpsToGemfile();
    await this.template("benchmark.ts", `script/benchmarks/${this.fileName}${this.ext()}`);
  }

  /** @internal */
  private async addIpsToGemfile(): Promise<void> {
    await this.gem(BenchmarkGenerator.IPS_GEM_NAME, { group: ["development", "test"] });
  }

  /** @internal */
  private async isIpsInstalled(): Promise<boolean> {
    return this.inRoot(async () => {
      return BenchmarkGenerator.IPS_GEM_USED_REGEXP.test(await File.readAsync("package.json"));
    });
  }
}
