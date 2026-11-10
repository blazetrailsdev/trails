import {
  ArgumentError,
  printf,
  print,
  puts,
  rbInspect,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import type { Report } from "./ips/report.js";

type Entry = InstanceType<typeof Report.Entry>;

function compare(...args: [...Entry[], { order?: string }] | Entry[]): void {
  let order = ":fastest";
  const last = args.at(-1);
  if (last != null && !("stats" in last)) {
    args.pop();
    order = last.order ?? order;
  }
  const entries = args as Entry[];
  if (entries.length < 2) return;

  let baseline: Entry;
  let sorted: Entry[];
  switch (order) {
    case ":baseline":
      baseline = entries.shift()!;
      sorted = [...entries]
        .sort((a, b) => a.stats.centralTendency() - b.stats.centralTendency())
        .reverse();
      break;
    case ":fastest":
      sorted = [...entries]
        .sort((a, b) => a.stats.centralTendency() - b.stats.centralTendency())
        .reverse();
      baseline = sorted.shift()!;
      break;
    default:
      throw new ArgumentError(`Unknown order: ${rbInspect(order)}`);
  }

  puts.call($stdout, "\nComparison:");

  printf.call(
    $stdout,
    "%20s: %10.1f i/s\n",
    String(baseline.label),
    baseline.stats.centralTendency(),
  );

  for (const report of sorted) {
    const name = String(report.label);

    printf.call($stdout, "%20s: %10.1f i/s - ", name, report.stats.centralTendency());

    if (report.stats.isOverlaps(baseline.stats)) {
      print.call($stdout, "same-ish: difference falls within error");
    } else if (report.stats.centralTendency() > baseline.stats.centralTendency()) {
      const [speedup, error] = report.stats.speedup(baseline.stats);
      printf.call($stdout, "%.2fx ", speedup);
      if (error != null) {
        printf.call($stdout, " (± %.2f)", error);
      }
      print.call($stdout, " faster");
    } else {
      const [slowdown, error] = report.stats.slowdown(baseline.stats);
      printf.call($stdout, "%.2fx ", slowdown);
      if (error != null) {
        printf.call($stdout, " (± %.2f)", error);
      }
      print.call($stdout, " slower");
    }

    puts.call($stdout);
  }

  const footer = baseline.stats.footer();
  if (footer != null) puts.call($stdout, footer.padStart(40));

  puts.call($stdout);
}

export const Compare = { compare };
