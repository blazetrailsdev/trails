import { cwd } from "@blazetrails/activesupport/process-adapter";
import {
  ConsoleFormatter,
  RoutesInspector,
  type RoutesFilter,
  type RoutesFormatter,
} from "@blazetrails/actionpack";
import { Command } from "commander";
import { bootApplicationBang } from "../command/actions.js";
import { Trails } from "../rails.js";

export function routesCommand(): Command {
  const cmd = new Command("routes");
  cmd
    .description("List all the defined routes")
    .option(
      "-c, --controller <controller>",
      "Filter by a specific controller, e.g. PostsController or Admin::PostsController.",
    )
    .option("-g, --grep <pattern>", "Grep routes by a specific pattern.")
    .option("-E, --expanded", "Print routes expanded vertically with parts explained.")
    .action(async (options) => {
      await bootApplicationBang(cwd());
      console.log(inspector().format(formatter(options), routesFilter(options)));
    });

  return cmd;
}

interface RoutesOptions {
  controller?: string;
  grep?: string;
  expanded?: boolean;
}

function inspector(): RoutesInspector {
  return new RoutesInspector(Trails.application!.routes().getRoutes());
}

function formatter(options: RoutesOptions): RoutesFormatter {
  if (options.expanded) {
    return new ConsoleFormatter.Expanded();
  } else {
    return new ConsoleFormatter.Sheet();
  }
}

function routesFilter(options: RoutesOptions): RoutesFilter {
  const filter: RoutesFilter = {};
  if (options.controller !== undefined) filter.controller = options.controller;
  if (options.grep !== undefined) filter.grep = options.grep;
  return filter;
}
