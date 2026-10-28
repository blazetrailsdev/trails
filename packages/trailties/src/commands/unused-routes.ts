import {
  ConsoleFormatter,
  RoutesInspector,
  type Journey,
  type RoutesFilter,
  type RoutesFormatter,
} from "@blazetrails/actionpack";
import { camelize, dasherize, safeConstantize, underscore } from "@blazetrails/activesupport";
import { getPath } from "@blazetrails/ruby-compat";
import { glob } from "@blazetrails/activesupport/glob";
import { exit } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Command } from "commander";
import { Actions } from "../command/actions.js";
import { Base } from "../command/base.js";
import { Trails } from "../rails.js";

interface ViewPathRoot {
  path: string;
}

interface ControllerClass {
  actionMethods(): string[];
  viewPaths?: () => Iterable<unknown>;
}

interface UnusedRoutesOptions {
  controller?: string;
  grep?: string;
}

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

  async unused(): Promise<boolean> {
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
  private controllerClassMissing(): boolean {
    return this.controllerName != null && this.controllerClass == null;
  }

  /** @internal */
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
    return !this.controllerClass.actionMethods().includes(String(this.actionName));
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

  async perform(): Promise<void> {
    await Actions.bootApplicationBang();
    await Trails.application!.reloadRoutesUnlessLoaded();

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
      for (const route of Trails.application!.routes().routes.routes) {
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
    const options = this.options as unknown as UnusedRoutesOptions;
    const filter: RoutesFilter = {};
    if (options.controller !== undefined) filter.controller = options.controller;
    if (options.grep !== undefined) filter.grep = options.grep;
    return filter;
  }
}

export function unusedRoutesCommand(): Command {
  const klass = UnusedRoutesCommand;
  const cmd = new Command(klass.commandName());
  cmd.argument("[args...]").allowUnknownOption().helpOption(false);
  cmd.action(async (_args: string[], _options: object, command: Command) => {
    await klass.perform(klass.commandName(), command.args);
  });

  return cmd;
}
