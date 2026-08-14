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
import { getFsAsync, getPathAsync, underscore } from "@blazetrails/activesupport";
import { Initializable } from "../initializable.js";
import { Trails } from "../rails.js";
import { LazyRouteSet } from "../engine/lazy-route-set.js";
import type { Root } from "../paths.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { DispatcherCallback, DrawCallback } from "@blazetrails/actionpack";
import { controllerDispatcher, type DispatchableControllerClass } from "@blazetrails/actionpack";

export interface FinisherRoutes {
  prepend(block: DrawCallback): void;
  append(block: DrawCallback): void;
  defineMountedHelper(name: string): void;
  /**
   * @noRailsEquivalent CONVERGEABLE — story
   * `converge-routeset-setdispatcher-to-per-route-dispatcher`. Rails builds
   * an `ActionDispatch::Routing::RouteSet::Dispatcher` per route in the
   * mapper (`mapper.rb:297`) and resolves the controller constant inside it;
   * trails' `RouteSet#call` still branches on one whole-set callback
   * (`route-set.ts:952`, marked legacy in-file) because
   * `Request#controllerClassFor` has no constant table to resolve against,
   * so the autoloader hands the table over through that seam.
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
  runAfterLoadPaths: () => void | Promise<void>;
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
 * (`finisher.rb:17-46`). Rails pushes every autoload path into
 * `Rails.autoloaders.main` and calls `autoloader.setup`, which is what makes
 * `"#{name.camelize}Controller"` resolvable when
 * `Request#controller_class_for` (`http/request.rb:94-110`) constantizes it
 * at dispatch time.
 *
 * ESM has no `const_missing` seam, so a constant cannot be materialised
 * lazily from a name; {@link loadControllers} imports the modules under the
 * autoload paths instead, and the resulting constant table is handed to the
 * routing layer — `ActionDispatch`'s {@link controllerDispatcher} is
 * `Dispatcher#serve`'s body and lives in `action_dispatch`, where Rails
 * keeps it.
 */
Finisher.initializer("setup_main_autoloader", async function (this: FinisherHost) {
  this.routes().setDispatcher(controllerDispatcher(await loadControllers(await this.paths())));
});

Finisher.initializer("add_internal_routes", function (this: FinisherHost) {
  if (!(Trails.env as unknown as { isDevelopment(): boolean }).isDevelopment()) return;
  this.routes().prepend((mapper) => {
    mapper.get("/rails/info/properties", { to: "rails/info#properties", internal: true });
    mapper.get("/rails/info/routes", { to: "rails/info#routes", internal: true });
    mapper.get("/rails/info/notes", { to: "rails/info#notes", internal: true });
    mapper.get("/rails/info", { to: "rails/info#index", internal: true });
  });

  this.routesReloader().runAfterLoadPaths = () => {
    this.routes().append((mapper) => {
      mapper.get("/", { to: "rails/welcome#index", internal: true });
    });
  };
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
 * @noRailsEquivalent PERMANENT — Zeitwerk's directory scan. Rails' `push_dir` hands a
 * directory to Zeitwerk, which maps `app/controllers/posts_controller.rb` to
 * the `PostsController` constant on demand; ESM resolves nothing from a name,
 * so the same mapping is computed eagerly here. Keyed by Rails' controller
 * path (`posts`, `admin/posts`) — the value `path_parameters[:controller]`
 * carries.
 */
async function loadControllers(paths: Root): Promise<Map<string, DispatchableControllerClass>> {
  const fs = await getFsAsync();
  const p = await getPathAsync();
  const out = new Map<string, DispatchableControllerClass>();
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
          out.set(underscore(match[1].replace(/-/g, "_")), value as DispatchableControllerClass);
        }
      }
    }
  }
  return out;
}
