import type { Browser, BrowserContext, Locator, Page } from "playwright";
import { classAttribute, reverseMerge, TopLevel } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Builder } from "@blazetrails/rack";
import { include, NoMethodError, rbFPublicSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ActionDispatch } from "../namespaces.js";
import type { RouteSet } from "./routing/route-set.js";
import { Driver, type BrowserName } from "./system-testing/driver.js";
import { Server, vite } from "./system-testing/server.js";
import { SetupAndTeardown } from "./system-testing/test-helpers/setup-and-teardown.js";
import { ScreenshotHelper } from "./system-testing/test-helpers/screenshot-helper.js";

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

/** @noRailsEquivalent PERMANENT */
export interface ElementAssertions {
  toBeVisible(): Promise<void>;
  toBeInTheDocument(): Promise<void>;
  toHaveTextContent(text: string | RegExp): Promise<void>;
  toHaveValue(value: string): Promise<void>;
}

declare module "vitest" {
  interface ExpectStatic {
    element(locator: Locator, options?: { timeout?: number; interval?: number }): ElementAssertions;
  }
}

/** @internal */
const sessions = new Map<string, Promise<{ browser: Browser; options: Record<string, unknown> }>>();

export class SystemTestCase extends TestCase {
  static readonly DEFAULT_HOST = DEFAULT_HOST;

  declare static driver: Driver | undefined;
  declare static isDriver: boolean;
  declare _context?: BrowserContext;
  declare _page?: Page;
  /** @internal */
  declare private _urlHelpers?: object | null;

  static {
    classAttribute.call(this, "driver", { instanceAccessor: false });
  }

  constructor(...args: ConstructorParameters<typeof TestCase>) {
    super(...args);
    const klass = this.constructor as typeof SystemTestCase;
    if (!klass.isDriver) klass.drivenBy("selenium");
    klass.driver!.use();
  }

  /**
   * @internal
   * @inventedArm afterAll — PERMANENT
   * @inventedArm inject — PERMANENT
   * @inventedArm poll — PERMANENT
   */
  static async startApplication(): Promise<void> {
    vite.app = new Builder(null, {}, (builder) => {
      builder.map("/", (builder) => {
        builder.run(TopLevel.Trails!.application!);
      });
    });

    await new Server().run();
    const { afterAll, expect, inject } = await import("vitest");
    ScreenshotHelper.screenshotDirectory ??= inject("screenshotDirectory");
    expect.element = (locator, options) => ({
      toBeVisible: () => expect.poll(() => locator.isVisible(), options).toBe(true),
      toBeInTheDocument: () => expect.poll(() => locator.count(), options).toBeGreaterThan(0),
      toHaveTextContent: (text) =>
        typeof text === "string"
          ? expect.poll(() => locator.textContent(), options).toContain(text)
          : expect.poll(() => locator.textContent(), options).toMatch(text),
      toHaveValue: (value) => expect.poll(() => locator.inputValue(), options).toBe(value),
    });
    afterAll(async () => {
      for (const session of sessions.values()) await (await session).browser.close();
      sessions.clear();
      await vite.server?.close();
      vite.server = undefined;
    });
  }

  static drivenBy(
    driver: string,
    { using = "chrome", screenSize = [1400, 1400], options = {} }: DrivenByOptions = {},
    capabilities?: ConstructorParameters<typeof Driver>[2],
  ): void {
    const driverOptions = { using, screenSize, options };

    this.driver = new Driver(driver, driverOptions, capabilities);
  }

  static servedBy({ host, port }: ServedByOptions): void {
    vite.config.server.host = host;
    vite.config.server.port = port;
  }

  /** @noRailsEquivalent PERMANENT */
  async page(): Promise<Page> {
    if (this._page) return this._page;
    let session = sessions.get(vite.currentDriver);
    if (!session) {
      const name = vite.currentDriver;
      session = vite.drivers[name](vite.app) as Promise<{
        browser: Browser;
        options: Record<string, unknown>;
      }>;
      sessions.set(name, session);
      session.catch(() => sessions.delete(name));
    }
    const { browser, options } = await session;
    this._context = await browser.newContext(options);
    return (this._page = await this._context.newPage());
  }

  /** @internal */
  private urlHelpers(): object | null {
    if (this._urlHelpers) return this._urlHelpers;
    const testApp = ActionDispatch.testApp as { routes: RouteSet } | null;
    if (testApp) {
      const klass = class {
        declare defaultUrlOptions: Record<string, unknown>;

        urlOptions(): Record<string, unknown> {
          return reverseMerge({ ...this.defaultUrlOptions }, { host: this.appHost() });
        }

        appHost(): string {
          return vite.appHost ?? vite.url ?? DEFAULT_HOST;
        }
      };
      include(klass, testApp.routes.urlHelpers());
      include(klass, testApp.routes.mountedHelpers());
      return (this._urlHelpers = new klass());
    }
    return (this._urlHelpers = null);
  }

  /** @internal */
  methodMissing(name: string, ...args: unknown[]): unknown {
    if (rbObjRespondTo(this.urlHelpers(), name)) {
      return rbFPublicSend(this.urlHelpers(), name, ...args);
    } else {
      throw new NoMethodError(
        `undefined method '${name}' for an instance of ${this.constructor.name}`,
      );
    }
  }

  /** @internal */
  respondToMissing(name: string, _includePrivate = false): boolean {
    return rbObjRespondTo(this.urlHelpers(), name);
  }
}

include(SystemTestCase, SetupAndTeardown);
include(SystemTestCase, ScreenshotHelper);
