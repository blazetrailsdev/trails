import { beforeEach, describe, it } from "vitest";
import { IntegrationTest } from "../../testing/integration.js";

describe("NonDispatchRoutedAppTest", () => {
  class SimpleApp {
    static call(_env: Record<string, unknown>): [number, Record<string, string>, string[]] {
      return [200, { "Content-Type": "text/plain" }, []];
    }

    static routes(): unknown[] {
      return [];
    }
  }

  class NonDispatchRoutedAppTest extends IntegrationTest {
    override setup(): void {
      super.setup();
      this.app = SimpleApp;
    }
  }

  let t: NonDispatchRoutedAppTest;
  const assertResponse = (type: number | string): void => t.assertResponse(type);
  beforeEach(async ({ task }) => {
    t = new NonDispatchRoutedAppTest(task.name);
    await t.beforeSetup();
    t.setup();
  });

  it("does not except", async () => {
    await t.get("/foo");
    assertResponse("success");
  });
});
