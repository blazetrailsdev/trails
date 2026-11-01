import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { AppBase } from "../../app-base.js";
import { PluginBuilder } from "./plugin-generator.js";

interface ActionsHost {
  directory(source: string, destination: string): Promise<unknown>;
}

const __dir__ = import.meta.dirname;

class Host extends AppBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.addSharedOptionsFor("plugin");
    this.methodAdded("getBuilderClass");
    this.methodAdded("name");
    this.methodAdded("namespacedName");
    this.methodAdded("underscoredName");
    this.methodAdded("camelizedModules");
    this.methodAdded("humanized");
    this.methodAdded("wrapInModules");
    this.methodAdded("dummyPath");
    this.methodAdded("author");
    this.methodAdded("email");
    this.methodAdded("railsVersionSpecifier");
    this.methodAdded("shebang");
    this.methodAdded("isApi");
    this.methodAdded("isFull");
    this.methodAdded("isMountable");
    this.methodAdded("isEngine");
    this.methodAdded("isWithDummyApp");
    this.methodAdded("isInsideApplication");
    this.methodAdded("railsAppPath");
    this.methodAdded("relativePath");
    this.methodAdded("testCommand");
  }
  inApp = false;
  mode: "plain" | "full" | "mountable" = "plain";
  getBuilderClass() {
    return PluginBuilder as never;
  }
  name() {
    return "blog-admin";
  }
  namespacedName() {
    return "blog/admin";
  }
  underscoredName() {
    return "blog_admin";
  }
  camelizedModules() {
    return "Blog::Admin";
  }
  humanized() {
    return "Blog admin";
  }
  wrapInModules(code: string) {
    return code;
  }
  dummyPath() {
    return "test/dummy";
  }
  author() {
    return "A";
  }
  email() {
    return "a@example.com";
  }
  railsVersionSpecifier() {
    return ">= 8.0.2";
  }
  shebang() {
    return "#!/usr/bin/env node";
  }
  isApi() {
    return false;
  }
  isFull() {
    return this.mode === "full";
  }
  isMountable() {
    return this.mode === "mountable";
  }
  isEngine() {
    return this.isFull() || this.isMountable();
  }
  isWithDummyApp() {
    return true;
  }
  isInsideApplication() {
    return this.inApp;
  }
  railsAppPath() {
    return this.destinationRoot;
  }
  relativePath() {
    return "vendor/blog-admin";
  }
  testCommand() {
    return "bin/test";
  }
}

describe("PluginBuilder", () => {
  let root: string;
  const generator = (mode: Host["mode"]) => {
    const g = new Host([root], { quiet: true }, { destinationRoot: root });
    g.mode = mode;
    return g;
  };

  beforeEach(async () => {
    root = Dir.mktmpdir("plugin-builder");
  });
  afterEach(async () => {
    await FileUtils.rmRf(root);
  });

  it("writes the manifest and workspace in place of the gemspec and Gemfile", async () => {
    const g = generator("plain");
    await g["build"]("gemspec");
    await g["build"]("gemfile");
    expect(JSON.parse(await File.readAsync(`${root}/package.json`)).name).toBe("blog-admin");
    expect(await File.readAsync(`${root}/pnpm-workspace.yaml`)).toContain("- .");
  });

  it("generates a railtie unless the plugin is an engine", async () => {
    const g = generator("plain");
    await g["build"]("lib");
    expect(await File.isExistAsync(`${root}/lib/blog/admin/railtie.ts`)).toBe(true);
    expect(await File.isExistAsync(`${root}/lib/blog/admin/engine.ts`)).toBe(false);
  });

  it("keeps only the engine's bin script and prepends the shebang", async () => {
    const g = generator("full");
    await g["build"]("bin");
    expect(await File.isExistAsync(`${root}/bin/test`)).toBe(false);
    expect(await File.readAsync(`${root}/bin/rails`)).toMatch(/^#!\/usr\/bin\/env node\n/);
  });

  it("resolves relative imports from a namespaced file", async () => {
    const g = generator("full");
    await g["build"]("lib");
    await g["build"]("test");
    expect(await File.readAsync(`${root}/lib/blog/admin.ts`)).toContain('"./admin/version.js"');
    const test = await File.readAsync(`${root}/test/blog/admin.test.ts`);
    expect(test).toContain('"./../test_helper.js"');
    expect(test).toContain('"../../lib/blog/admin/version.js"');
  });

  it("renders the root files", async () => {
    const g = generator("plain");
    for (const meth of ["readme", "gitignore", "cifiles", "rakefile"]) await g["build"](meth);
    expect(await File.readAsync(`${root}/README.md`)).toContain("Blog::Admin");
    expect(await File.readAsync(`${root}/.gitignore`)).toContain("/test/dummy/log/*.log");
    expect(await File.readAsync(`${root}/.github/workflows/ci.yml`)).toContain("pnpm install");
    expect(await File.isExistAsync(`${root}/Rakefile.ts`)).toBe(true);
  });

  it("configures the dummy application for an engine", async () => {
    const g = generator("mountable");
    await FileUtils.mkdirP(`${root}/test/dummy/config`);
    await File.writeAsync(
      `${root}/test/dummy/config/application.ts`,
      '  static {\n    // loadDefaults\n    this.config.loadDefaults("8.0");\n  }\n',
    );
    await g["build"]("testDummyConfig");
    await g["build"]("testDummyAssets");
    expect(await File.readAsync(`${root}/test/dummy/config/application.ts`)).toContain(
      '"8.0");\n\n    // For compatibility with applications that use this config\n    this.config.actionController.includeAllHelpers = false;',
    );
    expect(await File.readAsync(`${root}/test/dummy/config/boot.ts`)).toContain(
      '"../../../lib/blog/admin.js"',
    );
    expect(await File.readAsync(`${root}/test/dummy/config/routes.ts`)).toContain(
      "this.mount(Blog.Admin.Engine,",
    );
    expect(
      await File.isExistAsync(`${root}/test/dummy/app/assets/stylesheets/application.css`),
    ).toBe(true);
  });

  it("adds the plugin to an application's dependencies with none declared", async () => {
    const g = generator("plain");
    await File.writeAsync(`${root}/package.json`, '{ "dependencies": {} }');
    g.inApp = true;
    await g["build"]("gemfileEntry");
    expect(JSON.parse(await File.readAsync(`${root}/package.json`)).dependencies).toEqual({
      "blog-admin": "file:vendor/blog-admin",
    });
  });

  it("does not copy compiled template modules out of a directory", async () => {
    const g = generator("plain");
    await FileUtils.mkdirP(`${root}/source`);
    await File.writeAsync(`${root}/source/plain.txt`, "x");
    await File.writeAsync(`${root}/source/kept.tt.js`, "x");
    await File.writeAsync(`${root}/source/view.tt`, "y");
    await File.writeAsync(`${root}/source/view.tt.js`, "export default () => 'y';");
    await (g as unknown as ActionsHost).directory(`${root}/source`, "out");
    expect(Dir.children(`${root}/out`)).not.toContain("view.tt.js");
    expect(Dir.children(`${root}/out`)).toContain("kept.tt.js");
  });

  it("copies the app directory for a mountable engine", async () => {
    const g = generator("mountable");
    await g["build"]("app");
    await g["build"]("config");
    expect(
      await File.readAsync(`${root}/app/views/layouts/blog/admin/application.html.tse`),
    ).toContain('stylesheetLinkTag("blog/admin/application"');
    expect(await File.isExistAsync(`${root}/app/models/concerns/.keep`)).toBe(true);
    expect(await File.readAsync(`${root}/config/routes.ts`)).toContain(
      "Blog.Admin.Engine.instance().routes().draw(",
    );
  });
});
