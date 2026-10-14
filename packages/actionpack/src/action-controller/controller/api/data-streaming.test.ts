import { assertEqual, assertKindOf } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { beforeEach, describe, it } from "vitest";
import "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";

const TestApiFileUtils = {
  filePath(): string {
    return new URL(import.meta.url).pathname;
  },
  fileData(this: { data?: string }): string {
    return (this.data ||= File.binread(TestApiFileUtils.filePath()));
  },
};

class DataStreamingApiController extends API {
  declare data?: string;
  filePath = TestApiFileUtils.filePath;
  fileData = TestApiFileUtils.fileData;

  one() {}
  async two() {
    await this.sendData(this.fileData(), {});
  }
}

describe("DataStreamingApiTest", () => {
  class DataStreamingApiTest extends TestCase {
    static {
      this.tests(DataStreamingApiController);
    }

    declare data?: string;
    filePath = TestApiFileUtils.filePath;
    fileData = TestApiFileUtils.fileData;
  }

  let tc: DataStreamingApiTest;

  beforeEach(async ({ task }) => {
    tc = new DataStreamingApiTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("data", async () => {
    const response = await tc.process("two");
    assertKindOf(String, response.body);
    assertEqual(tc.fileData(), response.body);
  });
});
