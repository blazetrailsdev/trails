import { describe, it, expect, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { isSymbol } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { logProcessAction } from "./instrumentation.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";
import { ParamError } from "../../action-dispatch/http/param-error.js";
import { FixtureResolver, TemplateHandlers } from "@blazetrails/actionview";

function subscribeOnce(name: string, sink: Record<string, unknown>[]): () => void {
  const subscriber = Notifications.subscribe(
    name,
    (event: { payload: Record<string, unknown> }) => {
      sink.push({ ...event.payload });
    },
  );
  return () => Notifications.unsubscribe(subscriber);
}

function newRequest(): Request {
  return new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/widgets",
    QUERY_STRING: "token=secret",
    HTTP_HOST: "localhost",
    HTTP_ACCEPT: "text/html",
  });
}

describe("ActionController::Instrumentation#process_action", () => {
  const teardown: Array<() => void> = [];
  afterEach(() => {
    while (teardown.length > 0) teardown.pop()!();
  });

  it("publishes start_processing with the eight-key raw_payload", async () => {
    const events: Record<string, unknown>[] = [];
    teardown.push(subscribeOnce("start_processing.action_controller", events));

    class WidgetsController extends Base {
      static actions = ["index"];
      index(): void {
        this.head(204);
      }
    }
    const request = newRequest();
    await new WidgetsController().dispatch("index", request, new Response());

    expect(events).toHaveLength(1);
    expect(Object.keys(events[0])).toEqual([
      "controller",
      "action",
      "request",
      "params",
      "headers",
      "format",
      "method",
      "path",
    ]);
    expect(events[0].controller).toBe("WidgetsController");
    expect(events[0].action).toBe("index");
    expect(events[0].request).toBe(request);
    expect(events[0].method).toBe("GET");
    expect(events[0].path).toBe(request.filteredPath());
    expect(events[0].format).toBe(request.format.ref());
    expect(events[0].format).toBe(":html");
    expect(isSymbol(events[0].format)).toBe(true);
  });

  it("publishes process_action with the response status", async () => {
    const events: Record<string, unknown>[] = [];
    teardown.push(subscribeOnce("process_action.action_controller", events));

    class WidgetsController extends Base {
      static actions = ["index"];
      index(): void {
        this.head(204);
      }
    }
    const response = new Response();
    await new WidgetsController().dispatch("index", newRequest(), response);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(204);
    expect(events[0].response).toBe(response);
  });

  it("publishes process_action with the status mapped from the raised error's class name", async () => {
    const events: Record<string, unknown>[] = [];
    teardown.push(subscribeOnce("process_action.action_controller", events));

    class WidgetsController extends Base {
      static actions = ["index"];
      index(): void {
        throw new ParamError("bad param");
      }
    }
    await expect(
      new WidgetsController().dispatch("index", newRequest(), new Response()),
    ).rejects.toThrow(ParamError);

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(400);
  });

  it("publishes process_action with the view_runtime the render measured", async () => {
    const events: Record<string, unknown>[] = [];
    teardown.push(subscribeOnce("process_action.action_controller", events));

    class WidgetsController extends Base {
      static actions = ["index"];
      index(): void {
        this.render({ plain: "hello" });
      }
    }
    await new WidgetsController().dispatch("index", newRequest(), new Response());

    expect(events).toHaveLength(1);
    expect(typeof events[0].view_runtime).toBe("number");
    expect(events[0].view_runtime).toBeGreaterThanOrEqual(0);
  });

  it("publishes a view_runtime that covers a template render deferred to renderAsync", async () => {
    const events: Record<string, unknown>[] = [];
    teardown.push(subscribeOnce("process_action.action_controller", events));

    TemplateHandlers.registerTemplateHandler("html", {
      extensions: ["html"],
      call: (_template: unknown, source: string) => {
        const until = Date.now() + 20;
        while (Date.now() < until);
        return JSON.stringify(source);
      },
    });
    class SlowWidgetsController extends Base {
      static actions = ["index"];
      index(): void {
        this.render({ template: "slow_widgets/index" });
      }
    }
    SlowWidgetsController.layout = false;
    SlowWidgetsController.prependViewPath(
      new FixtureResolver({ "slow_widgets/index.html.html": "hello" }),
    );

    await new SlowWidgetsController().dispatch("index", newRequest(), new Response());

    expect(events).toHaveLength(1);
    expect(events[0].view_runtime).toBeGreaterThanOrEqual(20);
  });

  it("log_process_action formats a String view_runtime through to_f", () => {
    expect(logProcessAction({ view_runtime: "12.5" })).toEqual(["Views: 12.5ms"]);
    expect(logProcessAction({ view_runtime: "abc" })).toEqual(["Views: 0.0ms"]);
    expect(logProcessAction({})).toEqual([]);
  });
});
