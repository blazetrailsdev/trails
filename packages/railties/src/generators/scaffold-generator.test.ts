import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ScaffoldGenerator } from "./scaffold-generator.js";

let tmpDir: string;
let lines: string[];

function setupRoutes() {
  fs.mkdirSync(path.join(tmpDir, "src/config"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "src/config/routes.ts"), "// routes\n");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
  setupRoutes();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ScaffoldGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");
}

describe("ScaffoldGeneratorTest", () => {
  it("scaffold on invoke", () => {
    const gen = makeGen();
    const files = gen.run("product_line", [
      "title:string",
      "approved:boolean",
      "product:belongs_to",
      "user:references",
    ]);

    // Model
    const model = readFile("src/app/models/product-line.ts");
    expect(model).toContain("class ProductLine extends Base");

    expect(files.some((f) => f.includes("test/models/product-line.test.ts"))).toBe(true);

    const migration = files.find((f) => f.startsWith("db/migrations/"))!;
    const migContent = readFile(migration);
    expect(migContent).toContain('t.references("product"');
    expect(migContent).toContain('t.boolean("approved")');
    expect(migContent).toContain('t.references("user"');

    // Route
    const routes = readFile("src/config/routes.ts");
    expect(routes).toContain('resources("product_lines")');

    // Controller
    const controller = readFile("src/app/controllers/product-lines-controller.ts");
    expect(controller).toContain("class ProductLinesController");
    expect(controller).toContain("async index()");
    expect(controller).toContain("async show()");
    expect(controller).toContain("async create()");
    expect(controller).toContain("async update()");
    expect(controller).toContain("async destroy()");

    // Views
    expect(files.some((f) => f.includes("views/product_lines/index.html"))).toBe(true);
    expect(files.some((f) => f.includes("views/product_lines/show.html"))).toBe(true);
  });

  it.skip("api scaffold on invoke", () => {
    // Needs --api mode
  });

  it.skip("functional tests without attributes", () => {
    // Needs controller test generation matching Rails format
  });

  it.skip("system tests without attributes", () => {
    // Needs system test generation
  });

  it.skip("scaffold on revoke", () => {
    // Needs revoke/destroy behavior
  });

  it.skip("scaffold with namespace on invoke", () => {
    // Needs namespace support
  });

  it.skip("scaffold with namespace on revoke", () => {
    // Needs namespace + revoke
  });

  it.skip("scaffold generator on revoke does not mutilate legacy map parameter", () => {
    // Needs revoke behavior
  });

  it.skip("scaffold generator on revoke does not mutilate routes", () => {
    // Needs revoke behavior
  });

  it.skip("scaffold generator ignores commented routes", () => {
    // Needs commented route handling
  });

  it.skip("scaffold generator with switch resource route false", () => {
    // Needs --no-resource-route option
  });

  it.skip("scaffold generator no helper with switch no helper", () => {
    // Needs --no-helper option
  });

  it.skip("scaffold generator no helper with switch helper false", () => {
    // Needs --helper=false option
  });

  it.skip("scaffold generator outputs error message on missing attribute type", () => {
    // Needs error handling for missing types
  });

  it("scaffold generator belongs to and references", () => {
    const gen = makeGen();
    const files = gen.run("LineItem", ["product:belongs_to", "cart:references"]);
    const model = readFile("src/app/models/line-item.ts");
    expect(model).toContain('this.belongsTo("product")');
    expect(model).toContain('this.belongsTo("cart")');

    const migration = files.find((f) => f.startsWith("db/migrations/"))!;
    const migContent = readFile(migration);
    expect(migContent).toContain('t.references("product"');
    expect(migContent).toContain('t.references("cart"');
  });

  it("scaffold generator attachments", () => {
    const gen = makeGen();
    gen.run("Message", ["photos:attachments"]);
    const model = readFile("src/app/models/message.ts");
    expect(model).toContain('this.hasManyAttached("photos")');
  });

  it("scaffold generator rich text", () => {
    const gen = makeGen();
    gen.run("Message", ["content:rich_text"]);
    const model = readFile("src/app/models/message.ts");
    expect(model).toContain('this.hasRichText("content")');
  });

  it.skip("scaffold generator multi db abstract class", () => {
    // Needs --database option
  });

  it.skip("scaffold generator database with aliases", () => {
    // Needs --db alias
  });

  it.skip("scaffold generator password digest", () => {
    // Needs password_digest type support
  });

  it.skip("scaffold tests pass by default inside mountable engine", () => {
    // Needs engine support
  });

  it.skip("scaffold tests pass by default inside namespaced mountable engine", () => {
    // Needs engine support
  });

  it.skip("scaffold tests pass by default inside full engine", () => {
    // Needs engine support
  });

  it.skip("scaffold tests pass by default inside api mountable engine", () => {
    // Needs engine support
  });

  it.skip("scaffold tests pass by default inside api full engine", () => {
    // Needs engine support
  });

  it.skip("scaffold on invoke inside mountable engine", () => {
    // Needs engine support
  });

  it.skip("scaffold on revoke inside mountable engine", () => {
    // Needs engine support
  });
});

describe("ScaffoldGeneratorTest (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    jsLines = [];
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  it("generates .js controller and model files", () => {
    const gen = new ScaffoldGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
    const files = gen.run("Post", ["title:string"]);
    expect(files).toContain("src/app/controllers/posts-controller.js");
    expect(files).toContain("src/app/models/post.js");
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toMatch(/\.js$/);
  });

  it("omits TypeScript annotations in controller", () => {
    const gen = new ScaffoldGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
    gen.run("Post", ["title:string"]);
    const content = fs.readFileSync(
      path.join(jsTmpDir, "src/app/controllers/posts-controller.js"),
      "utf-8",
    );
    expect(content).not.toContain("Promise<void>");
    expect(content).toContain("export class PostsController");
  });
});
