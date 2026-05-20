import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { GeneratorBase } from "./base.js";

class TestGenerator extends GeneratorBase {}

let tmpDir: string;
let lines: string[];
let gen: TestGenerator;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-actions-"));
  lines = [];
  gen = new TestGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const read = (name: string) => fs.readFileSync(path.join(tmpDir, name), "utf-8");

function seed(name: string, body: string) {
  fs.mkdirSync(path.dirname(path.join(tmpDir, name)), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, name), body);
}

describe("ActionsTest", () => {
  it("gem should put gem in Gemfile", () => {
    gen.gem("will-paginate");
    expect(read("Gemfile")).toBe('gem "will-paginate"\n');
  });

  it("gem with options should put gem in Gemfile", () => {
    gen.gem("rspec", { group: "test" });
    expect(read("Gemfile")).toContain('gem "rspec", group: "test"');
  });

  it("gem with versions should put gem in Gemfile", () => {
    gen.gem("rails", "3.0", "< 4.0");
    expect(read("Gemfile")).toContain('gem "rails", "3.0", "< 4.0"');
  });

  it("gem with comment should put gem with comment in Gemfile", () => {
    gen.gem("will-paginate", { comment: "first line\nsecond line" });
    expect(read("Gemfile")).toBe('# first line\n# second line\ngem "will-paginate"\n');
  });

  it("route should add route", () => {
    seed("config/routes.rb", "App.routes.draw do\nend\n");
    gen.route('root "welcome#index"');
    expect(read("config/routes.rb")).toContain('root "welcome#index"');
  });

  it("route with namespace should wrap route in namespace block", () => {
    seed("config/routes.rb", "App.routes.draw do\nend\n");
    gen.route('root "admin#index"', { namespace: "admin" });
    const c = read("config/routes.rb");
    expect(c).toContain("namespace :admin do");
    expect(c).toContain('root "admin#index"');
  });

  it("environment should add data to application.rb", () => {
    seed("config/application.rb", "class Application < Rails::Application\nend\n");
    gen.environment('config.asset_host = "cdn.example.com"');
    expect(read("config/application.rb")).toContain('config.asset_host = "cdn.example.com"');
  });

  it("environment with env option should add data to environment file", () => {
    seed("config/environments/development.rb", "Rails.application.configure do\nend\n");
    gen.environment('config.asset_host = "localhost:3000"', { env: "development" });
    expect(read("config/environments/development.rb")).toContain(
      'config.asset_host = "localhost:3000"',
    );
  });

  it("generate should queue a sub-generator invocation", () => {
    gen.generate("scaffold", "Post", "title:string", "body:text");
    expect(gen.pendingGenerators).toEqual([
      { what: "scaffold", args: ["Post", "title:string", "body:text"] },
    ]);
    expect(lines.some((l) => l.includes("generate") && l.includes("scaffold"))).toBe(true);
  });
});
