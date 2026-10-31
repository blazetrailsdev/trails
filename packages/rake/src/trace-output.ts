import { classModule, rbOutputRs } from "@blazetrails/ruby-compat";

export class TraceOutput {
  static readonly [classModule] = true;

  /** @missingRailsArgs join — PERMANENT */
  traceOn(out: { print(...strings: string[]): unknown }, ...strings: (string | null)[]): void {
    const sep = rbOutputRs.value ?? "\n";
    let output: string;
    if (strings.length === 0) {
      output = sep;
    } else {
      output = strings
        .map((s) => {
          if (s == null) return "";
          return s.endsWith(sep) ? s : s + sep;
        })
        .join("");
    }
    out.print(output);
  }
}
