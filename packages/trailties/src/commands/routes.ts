import {
  ConsoleFormatter,
  RoutesInspector,
  type RoutesFilter,
  type RoutesFormatter,
} from "@blazetrails/actionpack";
import { rbArgv } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import type { Command } from "@blazetrails/thor/command";
import { invoke } from "../command.js";
import { Base } from "../command/base.js";
import { Trails } from "../rails.js";

interface RoutesOptions {
  controller?: string;
  grep?: string;
}

export class RoutesCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("controller", {
      aliases: "-c",
      desc: "Filter by a specific controller, e.g. PostsController or Admin::PostsController.",
    });
    klass.classOption("grep", { aliases: "-g", desc: "Grep routes by a specific pattern." });
    klass.classOption("expanded", {
      type: "boolean",
      aliases: "-E",
      desc: "Print routes expanded vertically with parts explained.",
    });
    klass.classOption("unused", {
      type: "boolean",
      aliases: "-u",
      desc: "Print unused routes.",
    });
    klass.noCommands(() => klass.methodAdded("invokeCommand"));
    klass.desc("routes", "List all the defined routes");
    klass.methodAdded("perform");
  }

  /** @missingRailsArgs invoke — PERMANENT */
  async invokeCommand(command: Command, ...args: unknown[]): Promise<unknown> {
    if (this.options.hasKey("unused")) {
      return invoke("unused_routes", rbArgv());
    } else {
      return super.invokeCommand(command, ...args);
    }
  }

  async perform(..._args: string[]): Promise<void> {
    await this.bootApplicationBang();
    await Trails.application!.reloadRoutesUnlessLoaded();

    this.say(this.inspector().format(this.formatter(), this.routesFilter()));
  }

  /** @internal */
  private inspector(): RoutesInspector {
    return new RoutesInspector(Trails.application!.routes().routes);
  }

  /** @internal */
  private formatter(): RoutesFormatter {
    if (this.options.hasKey("expanded")) {
      return new ConsoleFormatter.Expanded();
    } else {
      return new ConsoleFormatter.Sheet();
    }
  }

  /** @internal */
  private routesFilter(): RoutesFilter {
    const options = this.options as unknown as RoutesOptions;
    const filter: RoutesFilter = {};
    if (this.options.hasKey("controller")) filter.controller = options.controller;
    if (this.options.hasKey("grep")) filter.grep = options.grep;
    return filter;
  }
}
