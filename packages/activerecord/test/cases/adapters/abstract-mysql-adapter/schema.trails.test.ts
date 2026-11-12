import { describe, it, expect } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
} from "../../../../lib/adapters/abstract-mysql-adapter/test-helper.js";
import { Base } from "../../../../lib/base.js";
import { constGet, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Post } from "../../../models/post.js";

describeIfMysqlAdapter("SchemaTestTrails", () => {
  describe("the SchemaTest @omgpost", () => {
    it("does not rebind the canonical Post in the model registry", async () => {
      const adapter = await leaseMysqlAdapter();
      constSet(TopLevel, "Post", Post);
      const db = await adapter.currentDatabase();

      const omgpost = class extends Base {};
      omgpost.inheritanceColumn = "disabled";
      omgpost.tableName = `${db}.${Post.tableName}`;
      Object.defineProperty(omgpost, "name", { value: "Post" });

      expect(omgpost.name).toBe("Post");
      expect(constGet(Object, "Post")).toBe(Post);
      expect(Post.tableName).toBe("posts");
    });
  });
});
