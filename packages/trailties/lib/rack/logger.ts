import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { BodyProxy } from "@blazetrails/rack";
import { rbObjRespondTo, rbProcCall } from "@blazetrails/ruby-compat";
import { Request } from "@blazetrails/actionpack";
import { LogSubscriber, Notifications } from "@blazetrails/activesupport";
import type {
  NotificationHandle,
  Logger as ActiveSupportLogger,
  TaggedLogger,
} from "@blazetrails/activesupport";
import { Trails } from "../trails.js";

export type Tagger = string | ((request: Request) => string);

export class Logger extends LogSubscriber {
  private app: RackApp | { call: RackApp };
  private taggers: Tagger[];

  constructor(app: RackApp | { call: RackApp }, taggers: Tagger[] | null = null) {
    super();
    this.app = app;
    this.taggers = taggers ?? [];
  }

  // @ts-expect-error TS2416: CLAUDE.md, "Override arity (Ruby does not check it; TypeScript does)".
  override async call(env: RackEnv): Promise<RackResponse> {
    const request = new Request(env);

    const logger = this.logger;
    env["trails.rackLoggerTagCount"] = rbObjRespondTo(logger, "pushTags")
      ? (logger as TaggedLogger).pushTags(...this.computeTags(request)).length
      : 0;

    return this.callApp(request, env);
  }

  private async callApp(request: Request, env: RackEnv): Promise<RackResponse> {
    const loggerTagPopCount = env["trails.rackLoggerTagCount"] as number;

    const instrumenter = Notifications.instrumenter;
    const handle = instrumenter.buildHandle("request.action_dispatch", { request });
    handle.start();

    try {
      this.logger!.info(null, () => this.startedRequestMessage(request));
      const response = await (rbProcCall(this.app, env) as Promise<RackResponse>);
      const [status, headers, body] = response;
      const wrapped = new BodyProxy(body as AsyncIterable<unknown>, () =>
        this.finishRequestInstrumentation(handle, loggerTagPopCount),
      );
      if (Object.isFrozen(response)) {
        return [status, headers, wrapped] as RackResponse;
      }
      (response as unknown as [number, Record<string, string>, unknown])[2] = wrapped;
      return response;
    } catch (err) {
      this.finishRequestInstrumentation(handle, loggerTagPopCount);
      throw err;
    }
  }

  private startedRequestMessage(request: Request): string {
    return `Started ${request.rawRequestMethod} "${request.filteredPath()}" for ${request.remoteIp ?? "-"} at ${Temporal.Now.instant().toString()}`;
  }

  private computeTags(request: Request): string[] {
    return this.taggers.map((tag) => {
      if (typeof tag === "function") return tag(request);
      if (tag.startsWith(":")) {
        const name = tag.slice(1);
        const value = (request as unknown as Record<string, unknown>)[name];
        return String(typeof value === "function" ? value.call(request) : value);
      }
      return tag;
    });
  }

  /** @internal */
  override get logger(): ActiveSupportLogger | null {
    return Trails.logger;
  }

  private finishRequestInstrumentation(
    handle: NotificationHandle,
    loggerTagPopCount: number,
  ): void {
    handle.finish();
    const logger = this.logger;
    if (rbObjRespondTo(logger, "popTags") && loggerTagPopCount > 0)
      (logger as TaggedLogger).popTags(loggerTagPopCount);
    LogSubscriber.flushAllBang();
  }
}
