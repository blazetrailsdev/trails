import { afterEach, describe, expect, it } from "vitest";
import { onLoad, resetLoadHooks } from "@blazetrails/activesupport";
import { controllerConstants } from "@blazetrails/actionpack";
import { bodyToString } from "@blazetrails/rack";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("a generated app reloads its views in development", () => {
  let tmp: string;
  afterEach(() => {
    resetLoadHooks();
    FileUtils.rmRf(tmp);
    Trails.application = null;
    Application.appClass = null;
  });

  it("picks up an edited .tse template on the next request", async () => {
    tmp = Dir.mktmpdir("boot_app_reload");
    onLoad("before_initialize", (app: { config: { enableReloading: boolean } }) => {
      app.config.enableReloading = true;
    });
    await import("./__fixtures__/boot-app/config/application.js");
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await Trails.initialize();
    expect(app.config.isReloadingEnabled()).toBe(true);

    FileUtils.mkdirP(`${tmp}/posts`);
    const view = `${tmp}/posts/show.html.tse`;
    File.write(view, "<h1>Before edit</h1>");
    FileUtils.touch(view, { mtime: new Date(Date.now() - 10_000) });
    const posts = [...controllerConstants.values()].find((k) => k.name === "PostsController")!;
    (posts as unknown as { prependViewPath(path: string): void }).prependViewPath(tmp);

    const show = async (): Promise<string> => {
      const [, , body] = await app.app()({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/posts/show",
        HTTP_ACCEPT: "*/*",
      });
      return bodyToString(body);
    };

    expect(await show()).toContain("<h1>Before edit</h1>");
    File.write(view, "<h1>After edit</h1>");
    expect(app.reloader.check()).toBe(true);
    expect(await show()).toContain("<h1>After edit</h1>");
  }, 15_000);
});
