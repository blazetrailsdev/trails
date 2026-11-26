import "../constants.unused-routes.generated.js";
import {
  ConsoleFormatter,
  RoutesInspector,
  type Journey,
  type RoutesFilter,
  type RoutesFormatter,
} from "@blazetrails/actionpack";
import {
  camelize,
  dasherize,
  safeConstantize,
  tryCall,
  underscore,
} from "@blazetrails/activesupport";
import { getPath, publicInstanceMethods, toA } from "@blazetrails/ruby-compat";
import { glob } from "@blazetrails/activesupport/glob";
import { exit } from "@blazetrails/ruby-compat/process-adapter";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { Trails } from "../trails.js";

interface ViewPathRoot {
  path: string;
}

type ControllerClass = abstract new (...args: never[]) => unknown;

export class RouteInfo {
  /** @internal */
  private controllerName: string | undefined;
  /** @internal */
  private actionName: string | undefined;
  /** @internal */
  private controllerClass: ControllerClass | undefined;

  constructor(route: Journey.Route) {
    const requirements = route.requirements;
    this.controllerName = requirements["controller"] as string | undefined;
    this.actionName = requirements["action"] as string | undefined;
    this.controllerClass = safeConstantize(
      camelize(String(this.controllerName ?? "")) + "Controller",
    ) as ControllerClass | undefined;
  }

  async unused(): Promise<unknown> {
    return (
      this.controllerClassMissing() || (this.actionMissing() && (await this.templateMissing()))
    );
  }

  /**
   * @inventedArm underscore — PERMANENT
   * @inventedArm dasherize — PERMANENT
   * @internal
   */
  private async viewPath(root: ViewPathRoot): Promise<string> {
    const path = getPath();
    return path.join(
      root.path,
      dasherize(String(this.controllerName)),
      dasherize(underscore(String(this.actionName))),
    );
  }

  /** @internal */
  private controllerClassMissing(): unknown {
    return this.controllerName != null && this.controllerClass == null;
  }

  /** @internal */
  private async templateMissing(): Promise<unknown> {
    return (
      this.controllerClass &&
      (
        await Promise.all(
          toA((tryCall(this.controllerClass, "viewPaths") ?? []) as Iterable<unknown>).map(
            async (path) => glob(`${await this.viewPath(path as ViewPathRoot)}.*`, { cwd: "/" }),
          ),
        )
      ).flat().length === 0
    );
  }

  /** @internal */
  private actionMissing(): unknown {
    return (
      this.controllerClass &&
      !publicInstanceMethods(this.controllerClass).includes(String(this.actionName))
    );
  }
}

export class UnusedRoutesCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    this.hideCommandBang();
    klass.classOption("controller", {
      aliases: "-c",
      desc: "Filter by a specific controller, e.g. PostsController or Admin::PostsController.",
    });
    klass.classOption("grep", { aliases: "-g", desc: "Grep routes by a specific pattern." });
    klass.methodAdded("perform");
  }

  /** @internal */
  private _routes: Journey.Route[] | null = null;

  async perform(..._args: string[]): Promise<void> {
    await this.bootApplicationBang();
    this.say((await this.inspector()).format(this.formatter(), this.routesFilter()));

    if ((await this.routes()).length > 0) exit(1);
  }

  /** @internal */
  private async inspector(): Promise<RoutesInspector> {
    return new RoutesInspector(await this.routes());
  }

  /** @internal */
  private async routes(): Promise<Journey.Route[]> {
    if (this._routes === null) {
      const routes: Journey.Route[] = [];
      for (const route of Trails.application!.routes().routes().routes) {
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
    if (this.options.hasKey("controller"))
      filter.controller = this.options.get("controller") as string;
    if (this.options.hasKey("grep")) filter.grep = this.options.get("grep") as string;
    return filter;
  }
}
