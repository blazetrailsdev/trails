/**
 * Port of `Rails::Application::Finisher` from
 * `railties/lib/rails/application/finisher.rb`. Defines the finisher
 * initializers that run after the Trailtie + bootstrap initializers.
 *
 * `Application#initializers` splices these in after the Bootstrap and
 * Trailtie/Engine initializers, mirroring `application.rb:445-449`.
 *
 * Rails blocks of the form `initializer :foo do |app|` get the
 * Application instance both as `self` and as the block argument. In our
 * port, `Initializable` binds each initializer to its host via
 * `bind(context)` before calling `block.apply(context, args)`, so `this`
 * is already the host. The blocks here use `this: FinisherHost` and
 * skip the redundant argument.
 *
 * `Rails.env.development?` in `add_internal_routes` reads through a cast:
 * `Trails.env` is an `EnvironmentInquirer` whose per-environment predicates
 * are Proxy-generated (`string-inquirer.ts:12-28`) and so are absent from its
 * static type.
 *
 * The Rails initializers tied to Zeitwerk, eager loading, the
 * reloader/executor concurrency hooks, default session store, dependency
 * clearing, and YJIT are intentionally not ported here — they depend on subsystems we don't have or are out
 * of scope per the trailties plan.
 */
import { getFsAsync, getPathAsync, camelize, underscore } from "@blazetrails/activesupport";
import { Initializable } from "../initializable.js";
import { Trails } from "../rails.js";
import { LazyRouteSet } from "../engine/lazy-route-set.js";
import type { Root } from "../paths.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { DispatcherCallback, DrawCallback } from "@blazetrails/actionpack";
import { ActionController, Request, Response } from "@blazetrails/actionpack";

export interface FinisherRoutes {
  prepend(block: DrawCallback): void;
  defineMountedHelper(name: string): void;
  /**
   * @noRailsEquivalent Rails builds an
   * `ActionDispatch::Routing::RouteSet::Dispatcher` per route in the mapper
   * and resolves the controller constant inside it; trails' `RouteSet` takes
   * one dispatcher callback for the whole set (`route-set.ts:952`), so the
   * autoloader hands it over through this pre-existing seam.
   */
  setDispatcher(dispatcher: DispatcherCallback): void;
}

export interface FinisherReloader {
  toPrepare(block: ConfigurationBlock): void;
  prepareBang(): void;
}

export interface FinisherConfig {
  toPrepareBlocks: ConfigurationBlock[];
  eagerLoad: boolean | null;
}

export interface FinisherRoutesReloader {
  eagerLoad: boolean;
  executeUnlessLoaded(application: unknown): Promise<boolean>;
}

export interface FinisherHost {
  config: FinisherConfig;
  routes(): FinisherRoutes;
  reloader: FinisherReloader;
  routesReloader(): FinisherRoutesReloader;
  paths(): Promise<Root>;
  ensureGeneratorTemplatesAdded(): void;
  buildMiddlewareStack(): void;
}

export class Finisher extends Initializable {}

Finisher.initializer("add_generator_templates", function (this: FinisherHost) {
  this.ensureGeneratorTemplatesAdded();
});

/**
 * Mirrors `Finisher`'s `setup_main_autoloader` initializer
 * (`finisher.rb:17-46`), which pushes every autoload path into
 * `Rails.autoloaders.main` so `Request#controller_class_for`'s
 * `"#{name.camelize}Controller".constantize` finds a constant at dispatch
 * time.
 *
 * ESM has no `const_missing` seam, so a constant cannot be materialised
 * lazily from a name — the modules under the autoload paths are imported
 * here instead, and the classes they export become the controller constant
 * table the dispatcher reads. That table is handed to the route set as the
 * `ActionDispatch::Routing::RouteSet::Dispatcher` body below
 * (`action_dispatch/routing/route_set.rb:48-56`).
 */
Finisher.initializer("setup_main_autoloader", async function (this: FinisherHost) {
  const controllers = await loadControllers(await this.paths());

  this.routes().setDispatcher(async (controllerName, action, _params, env) => {
    // Rails: `controller = controller(req)` → `req.controller_class` →
    // `controller_class_for(name)` (`http/request.rb:94-110`).
    const controllerClass = controllers.get(controllerName);
    if (!controllerClass) {
      // Rails raises `ActionController::RoutingError` from
      // `Dispatcher#controller` when the constant is missing
      // (`route_set.rb:58-62`).
      throw new ActionController.RoutingError(
        `uninitialized constant ${camelize(underscore(controllerName))}Controller`,
      );
    }
    // Rails: `res = controller.make_response! req` then
    // `controller.dispatch(action, req, res)`.
    const req = new Request(env);
    const res = new Response();
    const controller = new controllerClass();
    await controller.dispatch(action, req, res);
    return controller.toRackResponse();
  });
});

Finisher.initializer("add_internal_routes", function (this: FinisherHost) {
  if (!(Trails.env as unknown as { isDevelopment(): boolean }).isDevelopment()) return;
  this.routes().prepend((mapper) => {
    mapper.get("/rails/info/properties", { to: "rails/info#properties", internal: true });
    mapper.get("/rails/info/routes", { to: "rails/info#routes", internal: true });
    mapper.get("/rails/info/notes", { to: "rails/info#notes", internal: true });
    mapper.get("/rails/info", { to: "rails/info#index", internal: true });
  });
});

Finisher.initializer("build_middleware_stack", function (this: FinisherHost) {
  this.buildMiddlewareStack();
});

Finisher.initializer("define_main_app_helper", function (this: FinisherHost) {
  this.routes().defineMountedHelper("main_app");
});

Finisher.initializer("add_to_prepare_blocks", function (this: FinisherHost) {
  for (const block of this.config.toPrepareBlocks) {
    this.reloader.toPrepare(block);
  }
});

Finisher.initializer("run_prepare_callbacks", function (this: FinisherHost) {
  this.reloader.prepareBang();
});

/**
 * Mirrors `Finisher`'s `set_routes_reloader_hook` initializer
 * (`finisher.rb:158-179`).
 *
 * @missingRailsCall reloaders, to_run — `Application#reloaders` and
 * `ActiveSupport::Reloader#to_run` are not ported, so the reloader is only
 * executed once here instead of being re-run on every reload.
 */
Finisher.initializer("set_routes_reloader_hook", async function (this: FinisherHost) {
  const reloader = this.routesReloader();
  reloader.eagerLoad = this.config.eagerLoad === true;

  if (!(this.routes() instanceof LazyRouteSet) || this.config.eagerLoad === true) {
    await reloader.executeUnlessLoaded(this);
  }
});

/**
 * @noRailsEquivalent Zeitwerk's directory scan. Rails' `push_dir` hands a
 * directory to Zeitwerk, which maps `app/controllers/posts_controller.rb` to
 * the `PostsController` constant on demand; ESM resolves nothing from a name,
 * so the same mapping is computed eagerly here. Keyed by Rails' controller
 * path (`posts`, `admin/posts`) — the value `path_parameters[:controller]`
 * carries.
 */
async function loadControllers(paths: Root): Promise<Map<string, ControllerClass>> {
  const fs = await getFsAsync();
  const p = await getPathAsync();
  const out = new Map<string, ControllerClass>();
  const node = paths.get("app/controllers");
  if (!node || !fs.readdir || !p.pathToFileURL) return out;

  for (const dir of await node.existentDirectories()) {
    for (const entry of await fs.readdir(dir)) {
      const match = entry.match(/^(.+)[-_]controller\.(?:ts|js)$/);
      if (!match) continue;
      const mod = (await import(p.pathToFileURL(p.join(dir, entry)).href)) as Record<
        string,
        unknown
      >;
      for (const value of Object.values(mod)) {
        if (typeof value === "function" && value.name.endsWith("Controller")) {
          out.set(underscore(match[1].replace(/-/g, "_")), value as ControllerClass);
        }
      }
    }
  }
  return out;
}

type ControllerClass = new () => ActionController.Base;
