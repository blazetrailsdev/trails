import { NamedBase, type NamedBaseOptions } from "../../named-base.js";

export interface BenchmarkRunOptions {
  reports?: string[];
}

export class BenchmarkGenerator extends NamedBase {
  constructor(options: NamedBaseOptions) {
    super(options);
  }

  run(options: BenchmarkRunOptions = {}): string[] {
    const reports = options.reports ?? ["before", "after"];
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
    return this.getCreatedFiles();
  }
}
