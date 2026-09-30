import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertNoMatch } from "@blazetrails/activesupport";
import * as Assertions from "../../testing/assertions.js";
import { Application } from "../../../application.js";
import { Trails } from "../../../rails.js";
import "../../../trailties/active-record.js";
import "../../../test-unit/trailtie.js";

class ScaffoldGeneratorApp extends Application {}
let ScaffoldGenerator: typeof import("./scaffold-generator.js").ScaffoldGenerator;

beforeAll(async () => {
  await ScaffoldGeneratorApp.instance().loadGenerators();
  ({ ScaffoldGenerator } = await import("./scaffold-generator.js"));
});

beforeEach(() => {
  Trails.application = ScaffoldGeneratorApp.instance();
});

afterEach(() => {
  Trails.application = null;
});

let tmpDir: string;
let lines: string[];

function setupRoutes() {
  fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "config/routes.ts"),
    "export function drawRoutes(mapper: Mapper): void {\n}\n",
  );
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

function listFiles(root: string): string[] {
  return (fs.readdirSync(root, { recursive: true }) as string[]).filter((f) =>
    fs.statSync(path.join(root, f)).isFile(),
  );
}

async function runGenerator(name: string, attributes: string[] = [], config: object = {}) {
  await ScaffoldGenerator.start([name, ...attributes], {
    cwd: tmpDir,
    output: (m) => lines.push(m),
    ...config,
  });
  return listFiles(tmpDir);
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(tmpDir, relativePath), "utf-8");
}

describe("ScaffoldGeneratorTest", () => {
  it("scaffold on invoke", async () => {
    const files = await runGenerator("product_line", [
      "title:string",
      "approved:boolean",
      "product:belongs_to",
      "user:references",
    ]);

    const model = readFile("app/models/product-line.ts");
    expect(model).toContain("class ProductLine extends ApplicationRecord");

    expect(files.some((f) => f.includes("test/models/product-line.test.ts"))).toBe(true);

    const migration = files.find((f) => f.startsWith("db/migrate/"))!;
    const migContent = readFile(migration);
    expect(migContent).toContain('t.belongsTo("product"');
    expect(migContent).toContain('t.boolean("approved")');
    expect(migContent).toContain('t.references("user"');

    const routes = readFile("config/routes.ts");
    expect(routes).toContain('resources("product_lines")');

    const controller = readFile("app/controllers/product-lines-controller.ts");
    expect(controller).toContain("class ProductLinesController extends ApplicationController");
    expect(controller).toContain("async index()");
    expect(controller).toContain("async show()");
    expect(controller).toContain("async create()");
    expect(controller).toContain("async update()");
    expect(controller).toContain("async destroy()");

    expect(fs.existsSync(path.join(tmpDir, "app/views/layouts/product_lines.html.tse"))).toBe(
      false,
    );

    for (const view of ["index", "show"]) {
      expect(fs.existsSync(path.join(tmpDir, `app/views/product_lines/${view}.html.tse`))).toBe(
        true,
      );
    }

    for (const view of ["edit", "new"]) {
      expect(readFile(`app/views/product_lines/${view}.html.tse`)).toMatch(
        /render\("form", \{ product_line: this\.product_line \}\)/,
      );
    }

    const form = readFile("app/views/product_lines/_form.html.tse");
    expect(form).toContain("product_line");
    expect(form).not.toContain("this.product_line");
  });

  it.skip("api scaffold on invoke", () => {});

  it.skip("functional tests without attributes", () => {});

  it.skip("system tests without attributes", () => {});

  it("scaffold on revoke", async () => {
    await runGenerator("product_line");
    await runGenerator("product_line", [], { behavior: "revoke" });

    expect(fs.existsSync(path.join(tmpDir, "app/models/product-line.ts"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "test/models/product-line.test.ts"))).toBe(false);
    expect(
      fs
        .readdirSync(path.join(tmpDir, "db/migrate"))
        .some((f) => /_create_product_lines\./.test(f)),
    ).toBe(false);

    expect(readFile("config/routes.ts")).not.toMatch(/resources\("product_lines"\)/);

    expect(fs.existsSync(path.join(tmpDir, "app/controllers/product-lines-controller.ts"))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(tmpDir, "test/controllers/product-lines-controller.test.ts")),
    ).toBe(false);

    expect(fs.existsSync(path.join(tmpDir, "app/views/product_lines"))).toBe(false);
  });

  it.skip("scaffold with namespace on invoke", () => {});

  it.skip("scaffold with namespace on revoke", () => {});

  it.skip("scaffold generator on revoke does not mutilate legacy map parameter", () => {});

  it("scaffold generator on revoke does not mutilate routes", async () => {
    await runGenerator("product_line");
    expect(readFile("config/routes.ts")).toBe(
      'export function drawRoutes(mapper: Mapper): void {\n  mapper.resources("product_lines");\n}\n',
    );

    await runGenerator("product_line", [], { behavior: "revoke" });

    expect(readFile("config/routes.ts")).toBe(
      "export function drawRoutes(mapper: Mapper): void {\n}\n",
    );
  });

  it.skip("scaffold generator ignores commented routes", () => {});

  it("scaffold generator with switch resource route false", async () => {
    await runGenerator("posts", ["--resource-route=false"]);
    await Assertions.assertFile.call({ destinationRoot: tmpDir }, "config/routes.ts", (route) => {
      assertNoMatch(/resources\("posts"\);$/m, route);
    });
  });

  it.skip("scaffold generator no helper with switch no helper", () => {});

  it.skip("scaffold generator no helper with switch helper false", () => {});

  it.skip("scaffold generator outputs error message on missing attribute type", () => {});

  it("scaffold generator belongs to and references", async () => {
    const files = await runGenerator("LineItem", ["product:belongs_to", "cart:references"]);
    const model = readFile("app/models/line-item.ts");
    expect(model).toContain('this.belongsTo("product")');
    expect(model).toContain('this.belongsTo("cart")');

    const migration = files.find((f) => f.startsWith("db/migrate/"))!;
    const migContent = readFile(migration);
    expect(migContent).toContain('t.belongsTo("product"');
    expect(migContent).toContain('t.references("cart"');

    const form = readFile("app/views/line_items/_form.html.tse");
    expect(form).toMatch(/^\W{4}<%= form\.textField\("product_id"\) %>/m);
    expect(form).toMatch(/^\W{4}<%= form\.textField\("cart_id"\) %>/m);

    const index = readFile("app/views/line_items/index.html.tse");
    expect(index).toMatch(/^\W{2}<% for \(const line_item of this\.line_items\) \{ %>/m);
    expect(index).toMatch(/^\W{4}<%= render\(line_item\) %>/m);
    expect(index).toMatch(/<%= linkTo\("Show this line item", line_item\) %>/);

    const show = readFile("app/views/line_items/show.html.tse");
    expect(show).toMatch(/<%= render\(this\.line_item\) %>/);
    expect(show).toMatch(/linkTo\("Edit this line item"/);
    expect(show).toMatch(/buttonTo\("Destroy this line item"/);
    expect(show).toMatch(/linkTo\("Back to line items"/);
  });

  it("scaffold generator attachments", async () => {
    await runGenerator("Message", ["video:attachment", "photos:attachments", "images:attachments"]);
    const model = readFile("app/models/message.ts");
    expect(model).toContain('this.hasManyAttached("photos")');

    const form = readFile("app/views/messages/_form.html.tse");
    expect(form).toMatch(/^\W{4}<%= form\.fileField\("video"\) %>/m);
    expect(form).toMatch(/^\W{4}<%= form\.fileField\("photos", \{ multiple: true \}\) %>/m);

    const partial = readFile("app/views/messages/_message.html.tse");
    expect(partial).toMatch(
      /^\W{4}<%= message\.video\.isAttached\(\) \? linkTo\(message\.video\.filename, message\.video\) : null %>/m,
    );
    expect(partial).toMatch(/^\W{6}<div><%= linkTo\(photo\.filename, photo\) %>/m);
  });

  it("scaffold generator rich text", async () => {
    await runGenerator("Message", ["content:rich_text"]);
    const model = readFile("app/models/message.ts");
    expect(model).toContain('this.hasRichText("content")');

    expect(readFile("app/views/messages/_form.html.tse")).toMatch(
      /^\W{4}<%= form\.richTextarea\("content"\) %>/m,
    );
  });

  it.skip("scaffold generator multi db abstract class", () => {});

  it.skip("scaffold generator database with aliases", () => {});

  it.skip("scaffold generator password digest", () => {});

  it.skip("scaffold tests pass by default inside mountable engine", () => {});

  it.skip("scaffold tests pass by default inside namespaced mountable engine", () => {});

  it.skip("scaffold tests pass by default inside full engine", () => {});

  it.skip("scaffold tests pass by default inside api mountable engine", () => {});

  it.skip("scaffold tests pass by default inside api full engine", () => {});

  it.skip("scaffold on invoke inside mountable engine", () => {});

  it.skip("scaffold on revoke inside mountable engine", () => {});
});

describe("ScaffoldGeneratorTest (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    fs.mkdirSync(path.join(jsTmpDir, "config"));
    fs.writeFileSync(
      path.join(jsTmpDir, "config/routes.ts"),
      "export function drawRoutes(mapper: Mapper): void {\n}\n",
    );
    jsLines = [];
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  it("generates .js controller and model files", async () => {
    await ScaffoldGenerator.start(["Post", "title:string"], {
      cwd: jsTmpDir,
      output: (m) => jsLines.push(m),
    });
    const files = listFiles(jsTmpDir);
    expect(fs.existsSync(path.join(jsTmpDir, "app/controllers/posts-controller.js"))).toBe(true);
    expect(files).toContain("app/models/post.js");
    const migFile = files.find((f) => f.startsWith("db/migrate/"));
    expect(migFile).toMatch(/\.js$/);
  });

  it("omits TypeScript annotations in controller", async () => {
    await ScaffoldGenerator.start(["Post", "title:string"], {
      cwd: jsTmpDir,
      output: (m) => jsLines.push(m),
    });
    const content = fs.readFileSync(
      path.join(jsTmpDir, "app/controllers/posts-controller.js"),
      "utf-8",
    );
    expect(content).not.toContain("Promise<void>");
    expect(content).toContain("export class PostsController");
  });
});
