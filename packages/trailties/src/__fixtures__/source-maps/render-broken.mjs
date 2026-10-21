import { Base, LookupContext } from "@blazetrails/actionview";
import { Application, Trails } from "@blazetrails/trailties";
import { buildViews } from "@blazetrails/trails-tsc";

const root = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/\/$/u, "");
await buildViews({ cwd: root });
class SourceMapsApp extends Application {}
const app = Trails.application ?? new SourceMapsApp();
app.config.setRoot(root);
await app.initialize();
const template = new LookupContext([`${root}/app/views`]).findTemplate(
  "show",
  ["broken"],
  false,
  [],
  {},
);
const error = await template
  .render(new (Base.withEmptyTemplateCache())(null, {}, null), {})
  .catch((e) => e);
console.log(JSON.stringify({ lineNumber: error.lineNumber() }));
