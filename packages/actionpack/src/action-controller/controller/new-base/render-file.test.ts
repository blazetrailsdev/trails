import { beforeEach, describe, it } from "vitest";
import { File, Pathname, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("RenderFile", { name: "RenderFile" });

class BasicController extends Base {
  static {
    Object.defineProperty(this, "name", { value: "RenderFile::BasicController" });
    this.viewPaths(import.meta.dirname);
  }

  async index(): Promise<void> {
    await this.render({
      file: File.expandPath(
        "../../../test-helpers/fixtures/test/hello-world.tse",
        import.meta.dirname,
      ),
    });
  }

  async pathname(): Promise<void> {
    await this.render({
      file: new Pathname(
        File.join(
          import.meta.dirname,
          ...["..", "..", "..", "test-helpers", "fixtures", "test", "dot.directory"],
          "render_file_with_ivar.tse",
        ),
      ),
    });
  }
}

controllerConstants.set("render_file/basic", BasicController);

class TestBasic extends Rack.TestCase {
  static {
    this.testing(BasicController);
  }
}

describe("TestBasic", () => {
  let t: TestBasic;
  const assertResponse = (body: string): void => t.assertResponse(body);

  beforeEach(({ task }) => {
    t = new TestBasic(task.name);
  });

  it("rendering simple file", async () => {
    await t.get(":index");
    assertResponse("Hello world!");
  });

  // BLOCKED: file-exist-takes-a-to-path-argument
  it.skip("rendering a Pathname", async () => {
    await t.get(":pathname");
    assertResponse("The secret is <%= this.secret %>\n");
  });
});
