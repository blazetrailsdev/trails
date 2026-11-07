import { afterEach, beforeEach, describe, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { Application } from "./application.js";
import { InfoController } from "./info-controller.js";
import { Annotation } from "./source-annotation-extractor.js";
import { Trails } from "./trails.js";

class InfoControllerNotesTestApp extends Application {}

describe("Trails::InfoController#notes", () => {
  let dir: string;
  let directoriesWas: string[];

  beforeEach(async () => {
    Trails.application = InfoControllerNotesTestApp.instance();
    Trails.application.config.secretKeyBase = "secret_key_base".repeat(4);
    dir = await mkdtemp(join(tmpdir(), "trails-info-notes-"));
    directoriesWas = Annotation.directories;
    Annotation.directories = [dir];
  });

  afterEach(async () => {
    Annotation.directories = directoriesWas;
    Trails.application = null;
    await rm(dir, { recursive: true, force: true });
  });

  it("renders a row per annotation, with the file name spanning its rows", async ({ task }) => {
    await writeFile(join(dir, "widget.ts"), "// TODO: first\nconst a = 1;\n// FIXME: second\n");
    const tc = new ActionController.TestCase(task.name);
    tc.controller = new InfoController();
    await tc.beforeSetup();
    tc.routes = new RouteSet();
    tc.routes.draw(function () {
      this.get("/trails/info/notes", { to: "trails/info#notes" });
    });
    tc.request.env["REMOTE_ADDR"] = "127.0.0.1";

    await tc.get("notes");

    tc.assertResponse("success");
    tc.assertSelect("#route_table tbody tr", 2);
    tc.assertSelect("#route_table tbody th[rowspan='2']", 1);
    tc.assertSelect("td.tag", "TODO");
    tc.assertSelect("td.tag", "FIXME");
  });
});
