type SystemTestHost = {
  page(): Promise<{
    locator(selector: string): {
      evaluate<A>(fn: (element: unknown, arg: A) => void, arg: A): Promise<void>;
    };
  }>;
};

/**
 * @inventedArm locator — PERMANENT
 * @inventedArm evaluate — PERMANENT
 */
async function fillInRichTextarea(
  this: SystemTestHost,
  locator: string | null | { with: unknown } = null,
  options?: { with: unknown },
): Promise<void> {
  if (locator !== null && typeof locator === "object") {
    options = locator;
    locator = null;
  }
  const page = await this.page();
  await page
    .locator(`xpath=${richTextareaXpath(locator)}`)
    .evaluate(
      (editor, html) =>
        (editor as { editor: { loadHTML(html: string): void } }).editor.loadHTML(html),
      String(options!.with),
    );
}

/** @noRailsEquivalent PERMANENT */
function richTextareaXpath(locator: string | null): string {
  if (locator == null) {
    return ".//trix-editor";
  } else {
    const string = xpathString(locator);
    const inputLocatedByName = `//input[(./@name = ${string})]/@id`;
    const inputLocatedByLabel = `//label[contains(normalize-space(string(.)), ${string})]/@for`;

    return (
      ".//trix-editor[(((((" +
      `./@id = ${string}) or ` +
      `(./@placeholder = ${string})) or ` +
      `(./@aria-label = ${string})) or ` +
      `(./@input = ${inputLocatedByName})) or ` +
      `(./@id = ${inputLocatedByLabel}))]`
    );
  }
}

/** @noRailsEquivalent PERMANENT */
function xpathString(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  return `concat('${value.split("'").join(`', "'", '`)}')`;
}

export const SystemTestHelper = {
  fillInRichTextarea,
  fillInRichTextArea: fillInRichTextarea,
};
