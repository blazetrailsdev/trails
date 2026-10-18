import { RouteSet } from "@blazetrails/actionpack";
import { include } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { Template } from "../template.js";
import { Tse } from "../template/handlers/tse.js";

class Context extends Base {}

export async function renderContent(
  start: string,
  inside: string,
  routes: RouteSet | null = null,
): Promise<string> {
  routes ??= (() => {
    const rs = new RouteSet();
    rs.draw(() => {});
    return rs;
  })();

  const view = class extends Context {};
  include(view, routes.urlHelpers());

  return String(
    await new Template(blockHelper(start, inside), `test${Math.random()}`, new Tse(), {
      virtualPath: "partial",
      format: ":html",
      locals: [],
    }).render(view.withEmptyTemplateCache().empty(), {}),
  );
}

function blockHelper(str: string, rest: string): string {
  return `<%= ${str}() => { %>${rest}<% }) %>`;
}
