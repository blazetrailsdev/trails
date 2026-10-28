import { NamedBase } from "../../named-base.js";

export class BenchmarkGenerator extends NamedBase {
  static {
    this.argument("reports", { type: "array", default: ["before", "after"] });
    this.methodAdded("generateLayout");
  }

  declare reports: string[];

  generateLayout(): void {
    const reports = this.reports;
    const ext = this.ext();
    const filename = `script/benchmarks/${this.fileName}${ext}`;
    const reportLines = reports.map((r) => `  ${r}: () => {},`).join("\n");

    this.createFile(
      filename,
      `// Any benchmarking setup goes here...

const reports: Record<string, () => void> = {
${reportLines}
};

for (const [name, fn] of Object.entries(reports)) {
  const start = performance.now();
  fn();
  console.log(\`\${name}: \${(performance.now() - start).toFixed(3)}ms\`);
}
`,
    );
  }
}
