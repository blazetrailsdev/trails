import { classAttribute, TopLevel } from "@blazetrails/activesupport";
import { Builder, type RackApp } from "@blazetrails/rack";
import { Driver, type BrowserName, type DriverOptions } from "./system-testing/driver.js";
import { Server, vite } from "./system-testing/server.js";

export const DEFAULT_HOST = "http://127.0.0.1";

export interface DrivenByOptions {
  using?: BrowserName;
  screenSize?: [number, number];
  options?: Record<string, unknown>;
}

export interface ServedByOptions {
  host: string;
  port: number;
}

export class SystemTestCase {
  declare static driver: Driver | undefined;
  declare static isDriver: boolean;

  static {
    classAttribute.call(this, "driver", { instanceAccessor: false });
  }

  constructor() {
    const klass = this.constructor as typeof SystemTestCase;
    if (!klass.driver) klass.drivenBy("playwright");
    klass.driver!.use();
  }

  static drivenBy(driver: string, options: DrivenByOptions = {}): void {
    const driverOptions: DriverOptions = {
      using: options.using ?? "chromium",
      screenSize: options.screenSize ?? [1400, 1400],
      options: options.options,
    };
    this.driver = new Driver(driver, driverOptions);
  }

  static servedBy(options: ServedByOptions): void {
    vite.config.server.host = options.host;
    vite.config.server.port = options.port;
  }

  /**
   * @internal
   * @inventedArm afterAll — PERMANENT
   */
  static async startApplication(): Promise<void> {
    vite.app = new Builder(null, {}, (builder) => {
      builder.map("/", (builder) => {
        builder.run(TopLevel.Trails!.application as unknown as RackApp);
      });
    });

    await new Server().run();
    const { afterAll } = await import("vitest");
    afterAll(async () => {
      await vite.server?.close();
      vite.server = undefined;
    });
  }

  /** @internal */
  private urlHelpers(): undefined {
    return undefined;
  }
}
