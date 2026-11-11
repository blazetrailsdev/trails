// A static view manifest: every compiled view imported up front, served by path.
//
// actionview's default template compiler loads `.trails/views/<path>.js` with
// a runtime `import()`, which an AOT binary cannot perform. This installs a
// compiler that answers from these static imports instead and falls back to
// the previous one for anything not listed.
import { setTemplateCompiler } from "@blazetrails/actionview/template.js";
import * as v0 from "../../.trails/views/layouts/application.html.tse.js";
import * as v1 from "../../.trails/views/trails/edit.html.tse.js";
import * as v2 from "../../.trails/views/trails/_form.html.tse.js";
import * as v3 from "../../.trails/views/trails/index.html.tse.js";
import * as v4 from "../../.trails/views/trails/new.html.tse.js";
import * as v5 from "../../.trails/views/trails/show.html.tse.js";
import * as v6 from "../../.trails/views/trails/_trail.html.tse.js";

const views: Record<string, unknown> = {
  "layouts/application.html.tse": v0,
  "trails/edit.html.tse": v1,
  "trails/_form.html.tse": v2,
  "trails/index.html.tse": v3,
  "trails/new.html.tse": v4,
  "trails/show.html.tse": v5,
  "trails/_trail.html.tse": v6,
};

const previous = setTemplateCompiler(async (template, methodName, source, file) => {
  const { identifier } = template;
  const at = identifier.lastIndexOf("/app/views/");
  const key = at === -1 ? "" : identifier.slice(at + "/app/views/".length);
  const mod = views[key];
  if (mod) return mod as Awaited<ReturnType<typeof previous>>;
  return previous(template, methodName, source, file);
});
