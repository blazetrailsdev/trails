/**
 * Snapshot tests for the D-1 multi-describe migration codemod.
 */
import { describe, it, expect } from "vitest";
import { migrateText } from "./d1-migrate-multi-describe.js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function prettify(text: string): string {
  return execFileSync(
    "pnpm",
    [
      "prettier",
      "--parser",
      "typescript",
      "--config",
      resolve(ROOT, ".prettierrc.json"),
      "--log-level",
      "silent",
    ],
    { cwd: ROOT, encoding: "utf8", input: text },
  );
}

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

describe("d1-migrate-multi-describe", () => {
  it("transforms inline createTestAdapter + defineSchema per describe", () => {
    const input = `
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

describe("FooTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, { items: { name: "string" } });
  });
  withTransactionalFixtures(() => adapter);

  it("works", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const item = await Item.create({ name: "a" });
    expect(item.name).toBe("a");
  });
});

describe("BarTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, { users: { email: "string" } });
  });
  withTransactionalFixtures(() => adapter);

  it("works", async () => {
    class User extends Base {
      static {
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ email: "a@b.com" });
    expect(u.email).toBe("a@b.com");
  });
});
`;
    const filePath = resolve(ROOT, "packages/activerecord/src/fake-multi.test.ts");
    const result = migrateText(input, filePath);
    expect(typeof result).toBe("string");
    const output = normalize(prettify(result as string));
    expect(output).toMatchSnapshot();
    expect(output).not.toContain("createTestAdapter");
    expect(output).not.toContain("this.adapter = adapter");
    expect(output).toContain("setupHandlerSuite()");
    expect(output).toContain("useHandlerTransactionalFixtures()");
    expect(output).toContain("defineSchema({");
  });

  it("transforms freshAdapter pattern that wraps defineSchema", () => {
    const input = `
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

const TEST_SCHEMA = {
  posts: { title: "string" },
} as const;

async function freshAdapter(): Promise<TestDatabaseAdapter> {
  const adapter = createTestAdapter();
  await defineSchema(adapter, TEST_SCHEMA);
  return adapter;
}

describe("AlphaTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = await freshAdapter();
  });
  withTransactionalFixtures(() => adapter);

  it("creates", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "hi" });
  });
});

describe("BetaTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = await freshAdapter();
  });
  withTransactionalFixtures(() => adapter);

  it("reads", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "hi" });
    const p = await Post.first();
    expect(p!.title).toBe("hi");
  });
});
`;
    const filePath = resolve(ROOT, "packages/activerecord/src/fake-fresh.test.ts");
    const result = migrateText(input, filePath);
    expect(typeof result).toBe("string");
    const output = normalize(prettify(result as string));
    expect(output).toMatchSnapshot();
    expect(output).not.toContain("freshAdapter");
    expect(output).not.toContain("createTestAdapter");
    expect(output).not.toContain("this.adapter = adapter");
    expect(output).toContain("setupHandlerSuite()");
    expect(output).toContain("defineSchema(TEST_SCHEMA)");
  });

  it("skips non-multi-describe files", () => {
    const input = `
import { describe, it, beforeAll } from "vitest";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";

describe("SingleTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, { things: { name: "string" } });
  });
});
`;
    const filePath = resolve(ROOT, "packages/activerecord/src/fake-single.test.ts");
    const result = migrateText(input, filePath);
    expect(result).toEqual({ skip: "not a multi-describe file (use standard codemod)" });
  });

  it("partially transforms when some describes are unsupported", () => {
    const input = `
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

describe("GoodTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, { items: { name: "string" } });
  });
  withTransactionalFixtures(() => adapter);

  it("works", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const item = await Item.create({ name: "a" });
    expect(item.name).toBe("a");
  });
});

describe("ManualTest", () => {
  it("does something without adapter setup", () => {
    expect(true).toBe(true);
  });
});
`;
    const filePath = resolve(ROOT, "packages/activerecord/src/fake-partial.test.ts");
    const result = migrateText(input, filePath);
    expect(typeof result).toBe("string");
    const output = result as string;
    expect(output).toContain("setupHandlerSuite()");
    expect(output).toContain("ManualTest");
  });
});
