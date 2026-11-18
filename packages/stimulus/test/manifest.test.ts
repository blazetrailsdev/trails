import { Pathname } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Manifest } from "../lib/manifest.js";

function fileFixture(fixtureName: string): Pathname {
  return new Pathname(new URL("fixtures/", import.meta.url).pathname).join(fixtureName);
}

describe("Stimulus::Manifest::Test", () => {
  it("generate manifest with multiple file types", async () => {
    const manifest = (await Manifest.generateFrom(fileFixture("controllers"))).join("");

    expect(manifest).toContain('import HelloController from "./hello_controller"');
    expect(manifest).toContain('application.register("hello", HelloController)');

    expect(manifest.split('import HelloController from "./hello_controller"').length - 1).toBe(1);
    expect(manifest.split('application.register("hello", HelloController').length - 1).toBe(1);

    expect(manifest).toContain('import CoffeeController from "./coffee_controller"');
    expect(manifest).toContain('application.register("coffee", CoffeeController)');

    expect(manifest).toContain('import TypeScriptController from "./type_script_controller"');
    expect(manifest).toContain('application.register("type-script", TypeScriptController)');

    expect(manifest).toContain(
      'import MultiWordDashController from "./multi-word-dash_controller"',
    );
    expect(manifest).toContain('application.register("multi-word-dash", MultiWordDashController)');

    expect(manifest).toContain(
      'import MultiWordUnderscoreController from "./multi_word_underscore_controller"',
    );
    expect(manifest).toContain(
      'application.register("multi-word-underscore", MultiWordUnderscoreController)',
    );

    expect(manifest).toContain(
      'import Namespace__NamespacedController from "./namespace/namespaced_controller"',
    );
    expect(manifest).toContain(
      'application.register("namespace--namespaced", Namespace__NamespacedController)',
    );

    expect(manifest).toContain(
      'import Namespace__MultiWordDashController from "./namespace/multi-word-dash_controller"',
    );
    expect(manifest).toContain(
      'application.register("namespace--multi-word-dash", Namespace__MultiWordDashController)',
    );

    expect(manifest).toContain(
      'import Namespace__MultiWordUnderscoreController from "./namespace/multi_word_underscore_controller"',
    );
    expect(manifest).toContain(
      'application.register("namespace--multi-word-underscore", Namespace__MultiWordUnderscoreController)',
    );
  });
});
