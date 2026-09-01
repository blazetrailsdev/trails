import {
  ConsoleFormatter,
  RoutesInspector,
  controllerConstants,
  type Route,
  type RoutesFilter,
  type RoutesFormatter,
} from "@blazetrails/actionpack";
import { underscore } from "@blazetrails/activesupport";
import { glob } from "@blazetrails/activesupport/glob";
import { exit } from "@blazetrails/activesupport/process-adapter";
import { Command } from "commander";
import { bootApplicationBang } from "../command/actions.js";
import { Trails } from "../rails.js";

interface ViewPathRoot {
  path: string;
}

interface ControllerClass {
  prototype: object;
  viewPaths?: () => Iterable<unknown>;
}

/**
 * Mirrors `Rails::Command::UnusedRoutesCommand::RouteInfo`
 * (`railties/lib/rails/commands/unused_routes/unused_routes_command.rb:12-39`).
 *
 * Rails resolves the controller with
 * `(@controller_name.to_s.camelize + "Controller").safe_constantize`; ESM has
 * no constant table, so the lookup goes through `controllerConstants` — the
 * same map `Request#controller_class_for` (`http/request.rb:94-110`) uses —
 * and a miss is the absent map entry rather than `safe_constantize`'s nil.
 */
export class RouteInfo {
  /** @internal */
  private controllerName: string | undefined;
  /** @internal */
  private actionName: string | undefined;
  /** @internal */
  private controllerClass: ControllerClass | undefined;

  constructor(route: Route) {
    const requirements = route.requirements;
    this.controllerName = requirements["controller"] as string | undefined;
    this.actionName = requirements["action"] as string | undefined;
    this.controllerClass = controllerConstants.get(
      underscore(String(this.controllerName ?? "")),
    ) as ControllerClass | undefined;
  }

  async unused(): Promise<boolean> {
    return (
      this.controllerClassMissing() || (this.actionMissing() && (await this.templateMissing()))
    );
  }

  /** @internal */
  private viewPath(root: ViewPathRoot): string {
    return [root.path, this.controllerName, this.actionName].join("/");
  }

  /** @internal */
  private controllerClassMissing(): boolean {
    return this.controllerName != null && this.controllerClass == null;
  }

  /** @internal */
  private async templateMissing(): Promise<boolean> {
    if (this.controllerClass == null) return false;
    const paths = this.controllerClass.viewPaths?.() ?? [];
    for (const path of paths) {
      // Rails' `Dir[...]` takes the absolute view path directly; trails' glob
      // seam always resolves against a cwd, so the root is spelled out.
      const found = await glob(`${this.viewPath(path as ViewPathRoot)}.*`, { cwd: "/" });
      if (found.length > 0) return false;
    }
    return true;
  }

  /** @internal */
  private actionMissing(): boolean {
    if (this.controllerClass == null) return false;
    return !(String(this.actionName) in this.controllerClass.prototype);
  }
}

export function unusedRoutesCommand(): Command {
  const cmd = new Command("unused_routes");
  cmd
    .description("Print unused routes")
    .option(
      "-c, --controller <controller>",
      "Filter by a specific controller, e.g. PostsController or Admin::PostsController.",
    )
    .option("-g, --grep <pattern>", "Grep routes by a specific pattern.")
    .action(async (options) => {
      await bootApplicationBang();
      const unused = await routes();
      console.log(inspector(unused).format(formatter(), routesFilter(options)));

      if (unused.length > 0) exit(1);
    });

  return cmd;
}

interface UnusedRoutesOptions {
  controller?: string;
  grep?: string;
}

async function routes(): Promise<Route[]> {
  const selected: Route[] = [];
  for (const route of Trails.application!.routes().getRoutes()) {
    if (await new RouteInfo(route).unused()) selected.push(route);
  }
  return selected;
}

function inspector(routes: Route[]): RoutesInspector {
  return new RoutesInspector(routes);
}

function formatter(): RoutesFormatter {
  return new ConsoleFormatter.Unused();
}

function routesFilter(options: UnusedRoutesOptions): RoutesFilter {
  const filter: RoutesFilter = {};
  if (options.controller !== undefined) filter.controller = options.controller;
  if (options.grep !== undefined) filter.grep = options.grep;
  return filter;
}
