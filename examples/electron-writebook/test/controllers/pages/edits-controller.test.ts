import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { Access } from "../../../app/models/access.ts";
import type { Book } from "../../../app/models/book.ts";
import type { Edit } from "../../../app/models/edit.ts";
import type { Leaf } from "../../../app/models/leaf.ts";
import { Page } from "../../../app/models/page.ts";

describe("Pages::EditsControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const pageEditPath = (leaf: Leaf, edit: Edit | string) =>
    `/pages/${leaf.id}/edits/${typeof edit === "string" ? edit : edit.id}`;
  const lastEdit = async (leaf: Leaf) => (await leaf.edits.last()) as Edit;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("kevin");
  });

  it("show an edit", async () => {
    await (
      await leaves("welcome_page")
    ).edit({ leafableParams: { body: "Completely new content" } });

    const leaf = await leaves("welcome_page");
    await t.get(pageEditPath(leaf, await lastEdit(leaf)));

    t.assertResponse(":success");
    t.assertSelect("p", /such a great handbook/);
    t.assertSelect("p", /Completely new content/);
  });

  it("show latest edit", async () => {
    await (await leaves("welcome_page")).edit({ leafableParams: { body: "Updated" } });

    await t.get(pageEditPath(await leaves("welcome_page"), "latest"));

    t.assertResponse(":success");
    t.assertSelect("p", /such a great handbook/);
  });

  it("show sanitizes dangerous content in previous version", async () => {
    const page = new Page();
    await page.setBody(`<img src=x onerror="alert(1)">`);
    const leaf = await (
      await fixture<Book>("books", "handbook")
    ).press(page, { title: "XSS Test" });
    await leaf.edit({ leafableParams: { body: "Clean content now" } });

    await t.get(pageEditPath(leaf, await lastEdit(leaf)));

    t.assertResponse(":success");
    expect(t.response.body).toContain('<img src="x">');
    expect(t.response.body).not.toMatch(/onerror/);
  });

  it("a trashed page's history is not reachable", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.edit({ leafableParams: { body: "Embargoed announcement: Project X" } });
    await leaf.trashedBang();

    await t.get(pageEditPath(leaf, "latest"));

    t.assertResponse(":not_found");
  });

  it("a trashed page's history is not reachable by a reader either", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.edit({ leafableParams: { body: "Embargoed announcement: Project X" } });
    await leaf.trashedBang();

    await t.signIn("jz");
    await t.get(pageEditPath(leaf, "latest"));

    t.assertResponse(":not_found");
  });

  it("a reader can't read a live page's history", async () => {
    await (await leaves("welcome_page")).edit({ leafableParams: { body: "Updated" } });

    await t.signIn("jz");
    await t.get(pageEditPath(await leaves("welcome_page"), "latest"));

    t.assertResponse(":forbidden");
  });

  it("an editor can still read a live page's history", async () => {
    await (await leaves("welcome_page")).edit({ leafableParams: { body: "Updated" } });

    await t.get(pageEditPath(await leaves("welcome_page"), "latest"));

    t.assertResponse(":success");
  });

  it("a user with no access to the book gets nothing", async () => {
    const leaf = await leaves("welcome_page");
    await leaf.edit({ leafableParams: { body: "Updated" } });
    await (await fixture<Access>("accesses", "jz_handbook")).destroyBang();

    await t.signIn("jz");
    await t.get(pageEditPath(leaf, "latest"));

    t.assertResponse(":not_found");
  });

  it("show sanitizes dangerous content in current version", async () => {
    await (
      await leaves("welcome_page")
    ).edit({
      leafableParams: { body: `<img src=x onerror="alert(1)">` },
    });

    const leaf = await leaves("welcome_page");
    await t.get(pageEditPath(leaf, await lastEdit(leaf)));

    t.assertResponse(":success");
    expect(t.response.body).toContain('<img src="x">');
    expect(t.response.body).not.toMatch(/onerror/);
  });
});
