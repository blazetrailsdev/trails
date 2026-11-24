import { beforeEach, describe, expect, it } from "vitest";
import { fixture, loadFixtures } from "../../test-helper.ts";
import type { Book } from "../../../app/models/book.ts";
import type { Leaf } from "../../../app/models/leaf.ts";
import { Page } from "../../../app/models/page.ts";

const ids = (leaves: Leaf[]) => leaves.map((leaf) => leaf.id);

describe("Leaf::PositionableTest", () => {
  let handbook: Book;
  const leaves = (label: string) => fixture<Leaf>("leaves", label);
  const positioned = async () => (await handbook.leaves.positioned().toArray()) as Leaf[];

  beforeEach(async () => {
    await loadFixtures();
    handbook = await fixture<Book>("books", "handbook");
  });

  const labels = async (...names: string[]) => ids(await Promise.all(names.map(leaves)));

  it("items are sorted in positioned order", async () => {
    expect(ids(await positioned())).toEqual(
      await labels("welcome_section", "welcome_page", "summary_page", "reading_picture"),
    );
  });

  it("items can be moved earlier", async () => {
    await (await leaves("welcome_page")).moveToPosition(0);
    expect(ids(await positioned())).toEqual(
      await labels("welcome_page", "welcome_section", "summary_page", "reading_picture"),
    );
  });

  it("items can be moved beyond the start, which puts them at the start", async () => {
    await (await leaves("welcome_page")).moveToPosition(-99);
    expect(ids(await positioned())).toEqual(
      await labels("welcome_page", "welcome_section", "summary_page", "reading_picture"),
    );
  });

  it("items can be moved later", async () => {
    await (await leaves("welcome_section")).moveToPosition(2);
    expect(ids(await positioned())).toEqual(
      await labels("welcome_page", "summary_page", "welcome_section", "reading_picture"),
    );
  });

  it("items can be moved beyond the end, which puts them at the end", async () => {
    await (await leaves("welcome_section")).moveToPosition(99);
    expect(ids(await positioned())).toEqual(
      await labels("welcome_page", "summary_page", "reading_picture", "welcome_section"),
    );
  });

  it("items can be moved to their existing position", async () => {
    await (await leaves("welcome_page")).moveToPosition(1);
    expect(ids(await positioned())).toEqual(
      await labels("welcome_section", "welcome_page", "summary_page", "reading_picture"),
    );
  });

  it("items can be moved in blocks", async () => {
    await (
      await leaves("welcome_section")
    ).moveToPosition(1, {
      followedBy: [await leaves("welcome_page"), await leaves("summary_page")],
    });
    expect(ids(await positioned())).toEqual(
      await labels("reading_picture", "welcome_section", "welcome_page", "summary_page"),
    );
  });

  it("new items are inserted at the end", async () => {
    const page = new Page();
    await page.setAttributes({ body: "New Page" });
    const newPage = await handbook.press(page, { title: "New Page" });
    expect((await positioned()).at(-1)!.id).toBe(newPage.id);
  });

  it("the first item in the collection has the expected score", async () => {
    await handbook.leaves.destroyAll();
    const page = new Page();
    await page.setAttributes({ body: "New Page" });
    const newPage = await handbook.press(page, { title: "New Page" });
    expect(Number(newPage.position_score)).toBe(1);
  });

  it("positioning is rebalanced when necessary", async () => {
    await (await leaves("welcome_section")).updateBang({ position_score: 1e-11 });
    await (await leaves("welcome_page")).updateBang({ position_score: 2e-11 });

    await (await leaves("summary_page")).moveToPosition(1);

    expect((await positioned())[1].id).toBe((await leaves("summary_page")).id);
    expect((await handbook.leaves.positioned().pluck("position_score")).map(Number)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("items know their neighbours", async () => {
    expect((await (await leaves("welcome_page")).previous())!.id).toBe(
      (await leaves("welcome_section")).id,
    );
    expect((await (await leaves("welcome_page")).next())!.id).toBe(
      (await leaves("summary_page")).id,
    );

    expect(await (await leaves("welcome_section")).previous()).toBeNull();
    expect(await (await leaves("reading_picture")).next()).toBeNull();
  });

  it("only active items are included as neighbours", async () => {
    expect((await (await leaves("welcome_page")).next())!.id).toBe(
      (await leaves("summary_page")).id,
    );

    await (await leaves("summary_page")).trashedBang();

    expect((await (await leaves("welcome_page")).next())!.id).toBe(
      (await leaves("reading_picture")).id,
    );
  });

  it("only active items are counted when determining position", async () => {
    await (await leaves("welcome_page")).trashedBang();
    const active = async () =>
      ids((await handbook.leaves.positioned().active().toArray()) as Leaf[]);

    await (await leaves("welcome_section")).moveToPosition(1);
    expect(await active()).toEqual(
      await labels("summary_page", "welcome_section", "reading_picture"),
    );

    await (await leaves("welcome_section")).moveToPosition(0);
    expect(await active()).toEqual(
      await labels("welcome_section", "summary_page", "reading_picture"),
    );
  });
});
