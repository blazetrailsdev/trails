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
 * Four of Rails' fourteen finisher initializers have no declaration here,
 * each because the subsystem it drives is unported:
 *
 * - `setup_default_session_store` (`finisher.rb:48-54`) — sets
 *   `config.session_store :cookie_store` so `build_stack` mounts a store
 *   (`default_middleware_stack.rb:76-81`). The `Configuration#session_store`
 *   reader it writes through IS ported (`application/configuration.ts`), but
 *   `Rack::Session::Abstract::Persisted#call` is not — the ported
 *   `AbstractStore` has no `call`, so a mounted `CookieStore` cannot serve a
 *   request. Blocked on porting Rack's session middleware cycle.
 * - `configure_executor_for_concurrency` (`finisher.rb:118-135`), with its
 *   `MonitorHook` / `InterlockHook` — `ActiveSupport::Executor#register_hook`
 *   and `ActiveSupport::Dependencies.interlock` are both unported, so there is
 *   no hook registry to register against.
 * - `set_clear_dependencies_hook` (`finisher.rb:182-228`) — clears
 *   `ActiveSupport::Dependencies` and `DescendantsTracker` around a reload.
 *   ESM has no constant unloading, so there is nothing to clear.
 * - `enable_yjit` (`finisher.rb:230-234`) — YJIT is a MRI JIT with no JS
 *   analogue.
 */
import { getFsAsync, getPathAsync, runLoadHooks, underscore } from "@blazetrails/activesupport";
import { Initializable } from "../initializable.js";
import { Trails } from "../rails.js";
import { LazyRouteSet } from "../engine/lazy-route-set.js";
import type { Root } from "../paths.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { DrawCallback } from "@blazetrails/actionpack";
import { controllerConstants, type DispatchableControllerClass } from "@blazetrails/actionpack";

export interface FinisherRoutes {
  prepend(block: DrawCallback): void;
  append(block: DrawCallback): void;
  defineMountedHelper(name: string): void;
}

export interface FinisherReloader {
  toPrepare(block: ConfigurationBlock): void;
  prepareBang(): void;
}

export interface FinisherConfig {
  toPrepareBlocks: ConfigurationBlock[];
  eagerLoad: boolean | null;
  eagerLoadNamespaces: unknown[];
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
 * autoload paths instead and seeds `ActionDispatch`'s
 * {@link controllerConstants} table — the stand-in for the Ruby namespace
 * `Request#controller_class_for` constantizes against.
 */
Finisher.initializer("setup_main_autoloader", async function (this: FinisherHost) {
  for (const [name, klass] of await loadControllers(await this.paths())) {
    controllerConstants.set(name, klass);
  }
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
 * Mirrors `Finisher`'s `eager_load!` initializer (`finisher.rb:75-88`).
 *
 * @missingRailsCall eager_load_all — CONVERGEABLE: Zeitwerk is unported; ESM
 * has no loader to walk (`finisher.rb:78`).
 * @missingRailsCall eager_load! — CONVERGEABLE: `Trails.eagerLoad` is unported
 * (`finisher.rb:79`).
 * @missingRailsCall after_class_unload — CONVERGEABLE: `ActiveSupport::Reloader`
 * has no class-unload hook in trails, and there is no autoloader to re-eager-load
 * (`finisher.rb:82-86`).
 */
Finisher.initializer("eager_load!", function (this: FinisherHost) {
  if (this.config.eagerLoad === true) {
    runLoadHooks("before_eager_load", this);
    for (const namespace of this.config.eagerLoadNamespaces) {
      (namespace as { eagerLoad?: () => void }).eagerLoad?.();
    }
  }
});

/**
 * Mirrors `Finisher`'s `finisher_hook` initializer (`finisher.rb:90-93`) —
 * "all initialization is done, including eager loading in production".
 */
Finisher.initializer("finisher_hook", function (this: FinisherHost) {
  runLoadHooks("after_initialize", this);
});

Finisher.initializer("add_internal_routes", function (this: FinisherHost) {
  if (!(Trails.env as unknown as Record<string, () => boolean>)["development?"]()) return;
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

/**
 * Mirrors `Finisher`'s `set_routes_reloader_hook` initializer
 * (`finisher.rb:158-179`).
 *
 * @missingRailsCall reloaders — CONVERGEABLE: `Application#reloaders` is not
 * ported, so the reloader is never registered on the reloaders collection
 * (`finisher.rb:162`).
 * @missingRailsCall to_run — CONVERGEABLE: `ActiveSupport::Reloader#to_run` is
 * not ported, so the reloader is only executed once here instead of being
 * re-run on every reload (`finisher.rb:164-177`).
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
  const out = new Map<string, DispatchableControllerClass>();
  const node = paths.get("app/controllers");
  if (!node) return out;

  for (const dir of await node.existentDirectories()) {
    await collectControllers(dir, "", out);
  }
  return out;
}

/**
 * Walks one autoload root, keying each controller class by the Rails
 * controller path its file spells — `posts`, `admin/posts` — which is the
 * value `path_parameters[:controller]` carries. Zeitwerk derives the same
 * mapping from the directory tree, so nested directories recurse.
 *
 * @internal
 */
async function collectControllers(
  dir: string,
  prefix: string,
  out: Map<string, DispatchableControllerClass>,
): Promise<void> {
  const fs = await getFsAsync();
  const p = await getPathAsync();
  if (!fs.readdir || !fs.stat || !p.pathToFileURL) return;

  for (const entry of await fs.readdir(dir)) {
    const full = p.join(dir, entry);
    if ((await fs.stat(full)).isDirectory()) {
      await collectControllers(full, `${prefix}${underscore(entry.replace(/-/g, "_"))}/`, out);
      continue;
    }
    const match = entry.match(/^(.+)[-_]controller\.(?:ts|js)$/);
    if (!match) continue;
    const mod = (await import(p.pathToFileURL(full).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (typeof value === "function" && value.name.endsWith("Controller")) {
        const name = `${prefix}${underscore(match[1].replace(/-/g, "_"))}`;
        out.set(name, value as DispatchableControllerClass);
      }
    }
  }
}
