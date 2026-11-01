import { afterEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { getFs, include } from "@blazetrails/ruby-compat";
import { Generation, Paths } from "../test-helpers/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface GenerationTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class GenerationTest extends TestCase {}
include(GenerationTest, Paths);
include(GenerationTest, Generation);

describe("TestHelpers::Generation#build_app", () => {
  let t: GenerationTest;

  afterEach(() => t.teardownApp());

  it("strips the ESLint autocorrect line and keeps the app's config writable", async () => {
    t = new GenerationTest("test");
    await t.buildApp();
    const appPath = await t.appPath();

    const development = await getFs().readFile(
      `${appPath}/config/environments/development.ts`,
      "utf-8",
    );
    expect(development).not.toContain("applyEslintAutocorrectAfterGenerateBang");
    expect(development).toContain("annotateRenderedViewWithFilenames = false;");
    expect(await getFs().readFile(`${appPath}/config/routes.ts`, "utf-8")).toContain(
      "ActionDispatch.deprecator().silence(",
    );
    expect(await getFs().readdir!(`${appPath}/config/initializers`)).toEqual([]);
  });
});
