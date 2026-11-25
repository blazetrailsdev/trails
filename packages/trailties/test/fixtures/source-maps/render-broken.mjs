import { Base, LookupContext } from "@blazetrails/actionview";
import { Application, Trails } from "@blazetrails/trailties";
import { buildViews } from "@blazetrails/trails-tsc";

const root = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/\/$/u, "");
await buildViews({ cwd: root });
class SourceMapsApp extends Application {
  static {
    this.config.loadDefaults("8.0");
  }
}
Application.register(SourceMapsApp);
const app = Trails.application;
app.config.setRoot(root);
await app.initializeBang();
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
