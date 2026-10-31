import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class BenchmarkGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.argument("reports", { type: "array", default: ["before", "after"] });
    this.methodAdded("generateLayout");
  }

  declare reports: string[];

  /** @missingRailsArgs template — PERMANENT */
  async generateLayout(): Promise<void> {
    await this.template("benchmark.ts", `script/benchmarks/${this.fileName}${this.ext()}`);
  }
}
