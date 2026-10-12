import { Trail } from "../models/trail.js";
import { ApplicationController } from "./application-controller.js";

export class TrailsController extends ApplicationController {
  static {
    this.beforeAction("setTrail", { only: ["show", "edit", "update", "destroy"] });
  }

  declare trails: Trail[];

  declare trail: Trail;

  declare trailsPath: (...args: unknown[]) => string;

  async index(): Promise<void> {
    this.trails = await Trail.all();
  }

  async show(): Promise<void> {}

  async new(): Promise<void> {
    this.trail = new Trail();
  }

  async edit(): Promise<void> {}

  async create(): Promise<void> {
    this.trail = new Trail(this.trailParams());

    if (await this.trail.save()) {
      this.redirectTo(this.trail, { notice: "Trail was successfully created." });
    } else {
      await this.render("new", { status: "unprocessable_entity" });
    }
  }

  async update(): Promise<void> {
    if (await this.trail.update(this.trailParams())) {
      this.redirectTo(this.trail, {
        notice: "Trail was successfully updated.",
        status: "see_other",
      });
    } else {
      await this.render("edit", { status: "unprocessable_entity" });
    }
  }

  async destroy(): Promise<void> {
    await this.trail.destroyBang();
    this.redirectTo(this.trailsPath(), {
      notice: "Trail was successfully destroyed.",
      status: "see_other",
    });
  }

  private async setTrail(): Promise<void> {
    this.trail = await Trail.find(this.params.expect("id"));
  }

  private trailParams() {
    return this.params.expect({ trail: ["name", "length"] });
  }
}
