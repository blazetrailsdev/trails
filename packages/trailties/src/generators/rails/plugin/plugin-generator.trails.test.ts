import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { AppBase } from "../../app-base.js";
import { PluginBuilder } from "./plugin-generator.js";

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
    this.methodAdded("isApi");
    this.methodAdded("isFull");
    this.methodAdded("isMountable");
    this.methodAdded("isEngine");
    this.methodAdded("isWithDummyApp");
    this.methodAdded("isInsideApplication");
    this.methodAdded("testCommand");
    this.methodAdded("run");
    this.methodAdded("build");
  }
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
    return false;
  }
  testCommand() {
    return "bin/test";
  }
  run(b: string) {
    return b;
  }
  build(meth: string) {
    return super.build(meth);
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
    await g.build("gemspec");
    await g.build("gemfile");
    expect(JSON.parse(await File.readAsync(`${root}/package.json`)).name).toBe("blog-admin");
    expect(await File.readAsync(`${root}/pnpm-workspace.yaml`)).toContain("- test/dummy");
  });

  it("generates a railtie unless the plugin is an engine", async () => {
    const g = generator("plain");
    await g.build("lib");
    expect(await File.isExistAsync(`${root}/lib/blog/admin/railtie.ts`)).toBe(true);
    expect(await File.isExistAsync(`${root}/lib/blog/admin/engine.ts`)).toBe(false);
  });

  it("copies the app directory for a mountable engine", async () => {
    const g = generator("mountable");
    await g.build("app");
    await g.build("config");
    expect(
      await File.readAsync(`${root}/app/views/layouts/blog/admin/application.html.tse`),
    ).toContain('stylesheetLinkTag("blog/admin/application"');
    expect(await File.isExistAsync(`${root}/app/models/concerns/.keep`)).toBe(true);
    expect(await File.readAsync(`${root}/config/routes.ts`)).toContain("Blog::Admin.Engine");
  });
});
