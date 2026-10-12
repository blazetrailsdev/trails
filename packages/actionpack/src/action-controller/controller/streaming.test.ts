import { beforeEach, describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import type { ResponseBuffer } from "../../action-dispatch/http/response.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

describe("StreamingResponseTest", () => {
  class TestController extends Base {
    static override controllerPath(): string {
      return "test";
    }

    basicStream() {
      const stream = this.response.stream as ResponseBuffer;
      for (const word of ["hello", "world"]) {
        stream.write(word);
        stream.write("\n");
      }
      stream.close();
    }
  }

  class StreamingResponseTest extends TestCase {
    static {
      this.tests(TestController);
    }
  }

  let tc: StreamingResponseTest;

  beforeEach(async ({ task }) => {
    tc = new StreamingResponseTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("write to stream", async () => {
    await tc.get("basicStream");
    assertEqual("hello\nworld\n", tc.response.body);
  });
});
