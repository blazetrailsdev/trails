import { describe, it, expect } from "vitest";
import { rbObjIvarDefined, rbObjIvarGet } from "@blazetrails/ruby-compat";
import { DebugView } from "../../../lib/action-dispatch/middleware/debug-view.js";

describe("DebugView", () => {
  it("seats a controller-delegate assign as its ivar", async () => {
    const response = { headers: { "Content-Type": "text/html" } };
    const view = new DebugView({
      request: {
        filteredParameters: () => ({}),
        session: {},
        env: {},
        constructor: { ENV_METHODS: [] },
      },
      response,
    });
    expect(rbObjIvarDefined(view, "@response")).toBe(true);
    expect(rbObjIvarGet(view, "@response")).toBe(response);
    expect(typeof (view as unknown as Record<string, unknown>).response).toBe("function");
    const out = String(
      await view.render({ partial: "rescues/request_and_response", formats: [":text"] }),
    );
    expect(out).toContain("Content-Type");
  });

  it("raises NameError for an assign that is not an ivar name", () => {
    expect(() => new DebugView({ "foo-bar": 1 })).toThrow(
      /is not allowed as an instance variable name/,
    );
  });
});
