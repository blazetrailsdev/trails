import "../../constants.console-irb-console.generated.js";
import { ActionDispatch } from "@blazetrails/actionpack";
import {
  Dir,
  STDERR,
  STDOUT,
  TopLevel,
  constGet,
  extend,
  getFs,
  getPath,
  getReplAsync,
} from "@blazetrails/ruby-compat";
import { Trails } from "../../trails.js";

export class RailsHelperBase {}

export class ControllerHelper extends RailsHelperBase {
  execute(): unknown {
    return (constGet(TopLevel, "ApplicationController") as { helpers(): unknown }).helpers();
  }
}

export class ControllerInstance extends RailsHelperBase {
  /** @internal */
  private _controller: unknown;

  execute(): unknown {
    return (this._controller ??= new (constGet(
      TopLevel,
      "ApplicationController",
    ) as new () => unknown)());
  }
}

export class NewSession extends RailsHelperBase {
  async execute(..._args: unknown[]): Promise<unknown> {
    const app = Trails.application!;
    await app.reloadRoutesUnlessLoaded();
    const session = new ActionDispatch.Integration.Session(app);

    extend(session, app.routes().urlHelpers());
    extend(session, app.routes().mountedHelpers());

    return session;
  }
}

export class AppInstance extends NewSession {
  /** @internal */
  private _appIntegrationInstance: unknown;

  override async execute(create = false): Promise<unknown> {
    if (create) this._appIntegrationInstance = null;
    return (this._appIntegrationInstance ??= await super.execute());
  }
}

export class ReloadHelper extends RailsHelperBase {
  execute(): unknown {
    STDOUT.puts("Reloading...");
    return Trails.application!.reloader.reloadBang();
  }
}

/** @noRailsEquivalent PERMANENT */
const HELPER_METHODS: Record<string, RailsHelperBase & { execute(...args: unknown[]): unknown }> = {
  helper: new ControllerHelper(),
  controller: new ControllerInstance(),
  newSession: new NewSession(),
  app: new AppInstance(),
  reload: new ReloadHelper(),
};

const BLUE = "\u001b[34m";
const RED = "\u001b[31m";
const CLEAR = "\u001b[0m";

export class IRBConsole {
  /** @internal */
  private app: { name(): string };

  constructor(app: { name(): string }) {
    this.app = app;
  }

  name(): string {
    return "IRB";
  }

  /**
   * @missingRailsCall key? — CONVERGEABLE irb-console-start-receipts-and-db-alias
   * @missingRailsCall filter — CONVERGEABLE irb-console-start-receipts-and-db-alias
   * @missingRailsCall run — CONVERGEABLE irb-console-start-receipts-and-db-alias
   * @inventedArm loadModels — CONVERGEABLE irb-console-start-receipts-and-db-alias
   * @inventedArm clearAllConnectionsBang — CONVERGEABLE irb-console-start-receipts-and-db-alias
   */
  async start(): Promise<void> {
    const { Base: ActiveRecordBase, Migration } = await import("@blazetrails/activerecord");
    const env = this.colorizedEnv();
    const promptPrefix = `${this.app.name()}(${env})`;

    const context = await this.loadModels({ Base: ActiveRecordBase, Migration });
    const repl = await getReplAsync();
    const server = repl.start({ prompt: `${promptPrefix}> `, useGlobal: true });
    Object.assign(server.context, context);
    for (const [name, helper] of Object.entries(HELPER_METHODS)) {
      server.context[name] = (...args: unknown[]) => helper.execute(...args);
    }

    await new Promise<void>((resolve) => server.on("exit", () => resolve()));
    await ActiveRecordBase.connectionHandler.clearAllConnectionsBang();
  }

  colorizedEnv(): string {
    switch (String(Trails.env)) {
      case "development":
        return `${BLUE}dev${CLEAR}`;
      case "test":
        return `${BLUE}test${CLEAR}`;
      case "production":
        return `${RED}prod${CLEAR}`;
      default:
        return String(Trails.env);
    }
  }

  /** @internal */
  private async loadModels(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fs = getFs();
    const path = getPath();
    const modelsDir = path.join(Dir.pwd(), "app", "models");
    if (await fs.exists(modelsDir)) {
      for (const file of await fs.readdir!(modelsDir)) {
        if (!/(?<!\.d|\.test)\.[tj]s$/.test(file)) continue;
        try {
          const mod = (await import(
            path.pathToFileURL!(path.join(modelsDir, file)).href
          )) as Record<string, unknown>;
          for (const [name, value] of Object.entries(mod)) {
            if (typeof value === "function") context[name] = value;
          }
        } catch (error) {
          STDERR.puts(`Could not load ${file}: ${(error as Error).message}`);
        }
      }
    }
    return context;
  }
}
