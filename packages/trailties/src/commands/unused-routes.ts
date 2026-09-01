import {
  ConsoleFormatter,
  RoutesInspector,
  controllerConstants,
  type Route,
  type RoutesFilter,
  type RoutesFormatter,
} from "@blazetrails/actionpack";
import { getPathAsync, underscore } from "@blazetrails/activesupport";
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

interface UnusedRoutesOptions {
  controller?: string;
  grep?: string;
}

/**
 * Mirrors `Rails::Command::UnusedRoutesCommand::RouteInfo`
 * (`railties/lib/rails/commands/unused_routes/unused_routes_command.rb:12-39`).
 *
 * Rails resolves the controller with
 * `(@controller_name.to_s.camelize + "Controller").safe_constantize`. ESM has
 * no constant table, so the lookup goes through `controllerConstants` — the
 * same map `Request#controller_class_for` (`http/request.rb:94-110`) uses —
 * and a miss arrives as the absent map entry rather than `safe_constantize`'s
 * nil.
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
  private async viewPath(root: ViewPathRoot): Promise<string> {
    const path = await getPathAsync();
    return path.join(root.path, String(this.controllerName), String(this.actionName));
  }

  /** @internal */
  private controllerClassMissing(): boolean {
    return this.controllerName != null && this.controllerClass == null;
  }

  /**
   * @internal
   * Rails globs `Dir["#{view_path(path)}.*"]`, whose pattern is absolute;
   * trails' glob seam always resolves against a cwd, so the filesystem root is
   * spelled out.
   */
  private async templateMissing(): Promise<boolean> {
    if (this.controllerClass == null) return false;
    const paths = this.controllerClass.viewPaths?.() ?? [];
    for (const path of paths) {
      const found = await glob(`${await this.viewPath(path as ViewPathRoot)}.*`, { cwd: "/" });
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

/**
 * Mirrors `Rails::Command::UnusedRoutesCommand`
 * (`railties/lib/rails/commands/unused_routes/unused_routes_command.rb:7-72`).
 */
export class UnusedRoutesCommand {
  /** @internal */
  private options: UnusedRoutesOptions;
  /** @internal */
  private _routes: Route[] | null = null;

  constructor(options: UnusedRoutesOptions) {
    this.options = options;
  }

  async perform(): Promise<void> {
    await bootApplicationBang();

    console.log((await this.inspector()).format(this.formatter(), this.routesFilter()));

    if ((await this.routes()).length > 0) exit(1);
  }

  /** @internal */
  private async inspector(): Promise<RoutesInspector> {
    return new RoutesInspector(await this.routes());
  }

  /** @internal */
  private async routes(): Promise<Route[]> {
    if (this._routes === null) {
      const routes: Route[] = [];
      for (const route of Trails.application!.routes().getRoutes()) {
        if (await new RouteInfo(route).unused()) routes.push(route);
      }
      this._routes = routes;
    }
    return this._routes;
  }

  /** @internal */
  private formatter(): RoutesFormatter {
    return new ConsoleFormatter.Unused();
  }

  /** @internal */
  private routesFilter(): RoutesFilter {
    const filter: RoutesFilter = {};
    if (this.options.controller !== undefined) filter.controller = this.options.controller;
    if (this.options.grep !== undefined) filter.grep = this.options.grep;
    return filter;
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
      await new UnusedRoutesCommand(options).perform();
    });

  return cmd;
}
