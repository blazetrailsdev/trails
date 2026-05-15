/**
 * ActionController::TemplateAssertions
 *
 * Template-related test assertions for controller tests.
 * @see https://api.rubyonrails.org/classes/ActionController/TemplateAssertions.html
 */

export function assertTemplate(
  rendered: string | string[] | null | undefined,
  expected: string | RegExp | null,
): void {
  if (expected === null) {
    if (rendered && rendered.length > 0) {
      const name = Array.isArray(rendered) ? rendered.join(", ") : rendered;
      throw new Error(`Expected no template to be rendered, but ${name} was rendered`);
    }
    return;
  }

  if (!rendered) {
    throw new Error(`Expected template ${expected} but no template was rendered`);
  }

  const templates = Array.isArray(rendered) ? rendered : [rendered];

  if (typeof expected === "string") {
    if (!templates.some((t) => t === expected || t.endsWith(`/${expected}`))) {
      throw new Error(`Expected template "${expected}" but got "${templates.join(", ")}"`);
    }
  } else {
    const pattern = new RegExp(expected.source, expected.flags.replace(/[gy]/g, ""));
    if (!templates.some((t) => pattern.test(t))) {
      throw new Error(`Expected template matching ${expected} but got "${templates.join(", ")}"`);
    }
  }
}
