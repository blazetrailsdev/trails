import { Base as ActiveRecordBase, Migration } from "@blazetrails/activerecord";
import {
  Dir,
  NotImplementedError,
  STDERR,
  getFs,
  getPath,
  getReplAsync,
} from "@blazetrails/ruby-compat";
import { Trails } from "../../rails.js";

const BLUE = "\u001b[34m";
const RED = "\u001b[31m";
const CLEAR = "\u001b[0m";

export class IRBConsole {
  /** @internal */
  private app: { name(): string; sandbox?: boolean | null };

  constructor(app: { name(): string; sandbox?: boolean | null }) {
    this.app = app;
  }

  name(): string {
    return "IRB";
  }

  /**
   * @missingRailsCall key? — CONVERGEABLE console-sandbox-rollback-and-irb-helpers
   * @missingRailsCall filter — CONVERGEABLE console-sandbox-rollback-and-irb-helpers
   * @missingRailsCall run — CONVERGEABLE console-sandbox-rollback-and-irb-helpers
   * @inventedArm loadModels — CONVERGEABLE console-sandbox-rollback-and-irb-helpers
   * @inventedArm clearAllConnectionsBang — CONVERGEABLE console-sandbox-rollback-and-irb-helpers
   */
  async start(): Promise<void> {
    if (this.app.sandbox) {
      throw new NotImplementedError("console sandbox rollback is not ported");
    }

    const env = this.colorizedEnv();
    const promptPrefix = `${this.app.name()}(${env})`;

    const context = await this.loadModels();
    const repl = await getReplAsync();
    const server = repl.start({ prompt: `${promptPrefix}> `, useGlobal: true });
    Object.assign(server.context, context);

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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE console-sandbox-rollback-and-irb-helpers
   */
  private async loadModels(): Promise<Record<string, unknown>> {
    const context: Record<string, unknown> = {
      Base: ActiveRecordBase,
      Migration,
    };
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
