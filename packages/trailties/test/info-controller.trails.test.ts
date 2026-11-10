import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { RouteSet } from "@blazetrails/actionpack";
import { TestCase } from "@blazetrails/actionpack/testing";
import { ApplicationController } from "../lib/application-controller.js";
import { Application } from "../lib/application.js";
import { InfoController } from "../lib/info-controller.js";
import { Annotation } from "../lib/source-annotation-extractor.js";
import { Trails } from "../lib/trails.js";

class InfoControllerNotesTestApp extends Application {}

describe("Trails::InfoController", () => {
  it("derives from Trails::ApplicationController under the trails/info path", () => {
    expect(Object.getPrototypeOf(InfoController)).toBe(ApplicationController);
    expect(InfoController.controllerPath()).toBe("trails/info");
  });

  it("drops the layout for an xhr request and uses application otherwise", () => {
    const layout = InfoController._layout as (this: unknown) => string | false;
    expect(layout.call({ request: { isXhr: () => true } })).toBe(false);
    expect(layout.call({ request: { isXhr: () => false } })).toBe("application");
  });
});

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
    const tc = new TestCase(task.name);
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
