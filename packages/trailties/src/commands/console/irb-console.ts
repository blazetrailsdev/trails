import "../../constants.console-irb-console.generated.js";
import { ActionController, ActionDispatch } from "@blazetrails/actionpack";
import { IRB, STDOUT, TopLevel, constGet, env as ENV, extend } from "@blazetrails/ruby-compat";
import { Trails } from "../../trails.js";

export class RailsHelperBase extends IRB.HelperMethod.Base {}

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

IRB.HelperMethod.register("helper", ControllerHelper);
IRB.HelperMethod.register("controller", ControllerInstance);
IRB.HelperMethod.register("newSession", NewSession);
IRB.HelperMethod.register("app", AppInstance);
IRB.HelperMethod.register("reloadBang", ReloadHelper);

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

  async start(): Promise<void> {
    IRB.setup(null);

    if (!Trails.env["local?"]() && !Object.hasOwn(ENV, "IRB_USE_AUTOCOMPLETE")) {
      IRB.conf.USE_AUTOCOMPLETE = false;
    }

    const env = this.colorizedEnv();
    const promptPrefix = `%N(${env})`;
    IRB.conf.IRB_NAME = this.app.name();

    (IRB.conf.PROMPT as Record<string, unknown>).RAILS_PROMPT = {
      PROMPT_I: `${promptPrefix}> `,
      PROMPT_S: `${promptPrefix}%l `,
      PROMPT_C: `${promptPrefix}* `,
      RETURN: "=> %s\n",
    };

    const currentFilter = IRB.conf.BACKTRACE_FILTER as
      | ((backtrace: string[]) => string[])
      | undefined;
    if (currentFilter != null) {
      IRB.conf.BACKTRACE_FILTER = (backtrace: string[]) => {
        backtrace = currentFilter(backtrace);
        return Trails.backtraceCleaner.filter(backtrace);
      };
    } else {
      IRB.conf.BACKTRACE_FILTER = (backtrace: string[]) => {
        return Trails.backtraceCleaner.filter(backtrace);
      };
    }

    if (IRB.conf.PROMPT_MODE === "DEFAULT") IRB.conf.PROMPT_MODE = "RAILS_PROMPT";
    await new IRB.Irb().run(IRB.conf);
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
