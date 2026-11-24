import { constSetPath } from "../../../support/const-set-path.js";
import { beforeEach, describe, it } from "vitest";
import { File } from "@blazetrails/ruby-compat/file";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { Base } from "../../../../lib/action-controller/base.js";
import { Rack } from "../../../support/abstract-unit.js";

constSet(TopLevel, "RenderFile", { name: "RenderFile" });

class BasicController extends Base {
  static {
    Object.defineProperty(this, "name", { value: "RenderFile::BasicController" });
    this.viewPaths(import.meta.dirname);
  }

  async index(): Promise<void> {
    await this.render({
      file: File.expandPath("../../../fixtures/test/hello-world.tse", import.meta.dirname),
    });
  }

  async pathname(): Promise<void> {
    await this.render({
      file: new Pathname(import.meta.dirname).join(
        ...["..", "..", "..", "fixtures", "test", "dot.directory", "render_file_with_ivar.tse"],
      ),
    });
  }
}

constSetPath("RenderFile::BasicController", BasicController);

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

  it("rendering a Pathname", async () => {
    await t.get(":pathname");
    assertResponse("The secret is <%= this.secret %>\n");
  });
});
