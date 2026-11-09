import "../../constants.console-tsrepl-console.generated.js";
import { ActionController, ActionDispatch } from "@blazetrails/actionpack";
import { TSREPL, STDOUT, TopLevel, constGet, env as ENV, extend } from "@blazetrails/ruby-compat";
import { Trails } from "../../trails.js";

export class RailsHelperBase extends TSREPL.HelperMethod.Base {}

export class ControllerHelper extends RailsHelperBase {
  execute(): unknown {
    return (constGet(TopLevel, "ApplicationController") as typeof ActionController.Base).helpers();
  }
}

export class ControllerInstance extends RailsHelperBase {
  /** @internal */
  private _controller: unknown;

  execute(): unknown {
    return (this._controller ??= new (constGet(
      TopLevel,
      "ApplicationController",
    ) as typeof ActionController.Base)());
  }
}

export class NewSession extends RailsHelperBase {
  async execute(..._args: unknown[]): Promise<unknown> {
    const app = Trails.application!;
    await app.reloadRoutesUnlessLoaded();
    await import("@blazetrails/actionpack/testing");
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

TSREPL.HelperMethod.register("helper", ControllerHelper);
TSREPL.HelperMethod.register("controller", ControllerInstance);
TSREPL.HelperMethod.register("newSession", NewSession);
TSREPL.HelperMethod.register("app", AppInstance);
TSREPL.HelperMethod.register("reloadBang", ReloadHelper);

const BLUE = "\u001b[34m";
const RED = "\u001b[31m";
const CLEAR = "\u001b[0m";

export class TSREPLConsole {
  /** @internal */
  private app: { name(): string };

  constructor(app: { name(): string }) {
    this.app = app;
  }

  name(): string {
    return "TSREPL";
  }

  async start(): Promise<void> {
    TSREPL.setup(null);

    if (!Trails.env["local?"]() && !Object.hasOwn(ENV, "TSREPL_USE_AUTOCOMPLETE")) {
      TSREPL.conf.USE_AUTOCOMPLETE = false;
    }

    const env = this.colorizedEnv();
    const promptPrefix = `%N(${env})`;
    TSREPL.conf.TSREPL_NAME = this.app.name();

    (TSREPL.conf.PROMPT as Record<string, unknown>).RAILS_PROMPT = {
      PROMPT_I: `${promptPrefix}> `,
      PROMPT_S: `${promptPrefix}%l `,
      PROMPT_C: `${promptPrefix}* `,
      RETURN: "=> %s\n",
    };

    const currentFilter = TSREPL.conf.BACKTRACE_FILTER as
      | ((backtrace: string[]) => string[])
      | undefined;
    if (currentFilter != null) {
      TSREPL.conf.BACKTRACE_FILTER = (backtrace: string[]) => {
        backtrace = currentFilter(backtrace);
        return Trails.backtraceCleaner.filter(backtrace);
      };
    } else {
      TSREPL.conf.BACKTRACE_FILTER = (backtrace: string[]) => {
        return Trails.backtraceCleaner.filter(backtrace);
      };
    }

    if (TSREPL.conf.PROMPT_MODE === "DEFAULT") TSREPL.conf.PROMPT_MODE = "RAILS_PROMPT";
    await new TSREPL.Tsrepl().run(TSREPL.conf);
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
}
