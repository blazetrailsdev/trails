import { ArgumentError, toS } from "@blazetrails/ruby-compat";

type SystemTestHost = {
  page(): Promise<{
    locator(selector: string): {
      evaluate<A>(fn: (element: unknown, arg: A) => void, arg: A): Promise<void>;
    };
  }>;
};

async function fillInRichTextarea(
  this: SystemTestHost,
  locator: string | null | { with?: unknown } = null,
  options: { with?: unknown } = {},
): Promise<void> {
  if (locator !== null && typeof locator === "object") {
    options = locator;
    locator = null;
  }
  if (!Object.hasOwn(options, "with")) throw new ArgumentError("missing keyword: :with");
  let xpath: string;
  if (locator == null) {
    xpath = ".//trix-editor";
  } else {
    const string = locator.includes("'")
      ? `concat('${locator.split("'").join(`', "'", '`)}')`
      : `'${locator}'`;
    const inputLocatedByName = `//input[(./@name = ${string})]/@id`;
    const inputLocatedByLabel = `//label[contains(normalize-space(string(.)), ${string})]/@for`;

    xpath =
      ".//trix-editor[(((((" +
      `./@id = ${string}) or ` +
      `(./@placeholder = ${string})) or ` +
      `(./@aria-label = ${string})) or ` +
      `(./@input = ${inputLocatedByName})) or ` +
      `(./@id = ${inputLocatedByLabel}))]`;
  }
  const page = await this.page();
  await page
    .locator(`xpath=${xpath}`)
    .evaluate(
      (editor, html) =>
        (editor as { editor: { loadHTML(html: string): void } }).editor.loadHTML(html),
      toS(options.with),
    );
}

export const SystemTestHelper = {
  fillInRichTextarea,
  fillInRichTextArea: fillInRichTextarea,
};
