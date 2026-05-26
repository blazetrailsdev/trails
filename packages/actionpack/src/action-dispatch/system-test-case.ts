import { Driver, type BrowserName, type DriverOptions } from "./system-testing/driver.js";
import { Server, type ServerApp } from "./system-testing/server.js";

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
  static driver: Driver | undefined;
  private static _server: Server | undefined;
  private static _serverHost: string | undefined;
  private static _serverPort: number | undefined;
  private _driverReady: Promise<void>;

  constructor() {
    const klass = this.constructor as typeof SystemTestCase;
    if (!klass.driver) klass.drivenBy("playwright");
    this._driverReady = klass.driver!.use();
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
    this._serverHost = options.host;
    this._serverPort = options.port;
  }

  /** @internal */
  static async startApplication(app: ServerApp): Promise<void> {
    const server = new Server();
    await server.run(app);
    this._server = server;
  }

  /** @internal */
  private urlHelpers(): undefined {
    return undefined;
  }
}
