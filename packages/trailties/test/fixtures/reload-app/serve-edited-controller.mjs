import { Application, Trails } from "@blazetrails/trailties";
import { Dependencies, DescendantsTracker } from "@blazetrails/activesupport";
import { Dir, File, FileUtils, TopLevel } from "@blazetrails/ruby-compat";

const here = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/\/$/u, "");
const root = File.realpath(Dir.mktmpdir("app", here));
const past = new Date(Date.now() - 10_000);

const controller = (
  version,
) => `import { ApplicationController } from "./application-controller.ts";
export class PostsController extends ApplicationController {
  async show() {
    await this.render({ json: { version: ${version} } });
  }
}
`;

const write = (path, source) => {
  FileUtils.mkdirP(File.dirname(`${root}/${path}`));
  File.write(`${root}/${path}`, source);
  FileUtils.touch(`${root}/${path}`, { mtime: past });
};

try {
  write(
    "app/controllers/application-controller.ts",
    `import { ActionController } from "@blazetrails/actionpack";
export class ApplicationController extends ActionController.API {}
`,
  );
  write("app/controllers/posts-controller.ts", controller(1));
  write(
    "config/routes.ts",
    `import { Trails } from "@blazetrails/trailties";
Trails.application.routes().draw(function () {
  this.get("/posts/show", { to: "posts#show" });
});
`,
  );

  class ReloadApp extends Application {}
  Application.register(ReloadApp, root);
  const app = Trails.application;
  app.config.setRoot(root);
  app.config.enableReloading = true;
  app.config.eagerLoad = false;
  await app.initializeBang();

  const show = async () => {
    const [status, , body] = await app.app().call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/show",
      HTTP_ACCEPT: "*/*",
      "rack.input": null,
    });
    const text = [];
    for await (const chunk of body) text.push(chunk);
    if (status !== 200) throw new Error(`${status}: ${text.join("")}`);
    return JSON.parse(text.join("")).version;
  };

  const before = await show();
  const oldClass = TopLevel.PostsController;
  const tracked = Dependencies._autoloadedTrackedClasses.has(oldClass);
  File.write(`${root}/app/controllers/posts-controller.ts`, controller(2));
  const after = await show();

  console.log(
    JSON.stringify({
      before,
      after,
      tracked,
      newClass: TopLevel.PostsController !== oldClass,
      newParent:
        Object.getPrototypeOf(TopLevel.PostsController) === TopLevel.ApplicationController &&
        Object.getPrototypeOf(oldClass) !== TopLevel.ApplicationController,
      oldClassExcluded: !DescendantsTracker.subclasses(Object.getPrototypeOf(oldClass)).includes(
        oldClass,
      ),
    }),
  );
} finally {
  FileUtils.rmRf(root);
}
