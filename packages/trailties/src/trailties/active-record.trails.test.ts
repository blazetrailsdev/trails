import { describe, it, expect } from "vitest";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Trailtie } from "./active-record.js";
import { Deprecators, Notifications, runLoadHooks } from "@blazetrails/activesupport";
import { ActionController, Request, Response } from "@blazetrails/actionpack";
import { RuntimeRegistry } from "@blazetrails/activerecord";

const blogApp = (): {
  config: { filterParameters: Array<string | RegExp> };
  deprecators: Deprecators;
} => ({
  deprecators: new Deprecators(),
  config: { filterParameters: [] },
});

describe("RailtieTest (trails-only)", () => {
  it("runInitializers includes ControllerRuntime into ActionController::Base", async () => {
    await runTrailtieInitializers(Trailtie, blogApp());
    class LogRuntimeController extends ActionController.Base {}
    runLoadHooks("action_controller", LogRuntimeController);

    const events: Record<string, unknown>[] = [];
    const subscriber = Notifications.subscribe(
      "process_action.action_controller",
      (event: { payload: Record<string, unknown> }) => {
        events.push({ ...event.payload });
      },
    );

    class WidgetsController extends LogRuntimeController {
      static actions = ["index"];
      index(): void {
        RuntimeRegistry.record("SELECT 1", 12.0);
        this.head(204);
      }
    }

    try {
      await new WidgetsController().dispatch(
        "index",
        new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/widgets", HTTP_HOST: "localhost" }),
        new Response(),
      );
    } finally {
      Notifications.unsubscribe(subscriber);
    }

    expect(events).toHaveLength(1);
    expect(events[0].db_runtime).toBe(12.0);
    expect(events[0].queries_count).toBe(1);
    expect(events[0].cached_queries_count).toBe(0);
    expect(LogRuntimeController.logProcessAction(events[0])).toContain(
      "ActiveRecord: 12.0ms (1 query, 0 cached)",
    );
  });
});
