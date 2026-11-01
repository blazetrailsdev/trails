import { Base } from "@blazetrails/activerecord";
import { Process } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { ApplicationController } from "./application-controller.ts";

export class HealthController extends ApplicationController {
  static {
    this.allowUnauthenticatedAccess();
  }

  async show(): Promise<void> {
    try {
      await (await Base.connection)!.selectValue("SELECT 1");
      await this.render({ json: { status: "ok", db: "ok", uptime_s: this.uptimeSeconds() } });
    } catch (error) {
      await this.render({
        json: { status: "degraded", db: "unreachable", error: (error as Error).message },
        status: ":service_unavailable",
      });
    }
  }

  private uptimeSeconds(): number {
    return Math.trunc(
      Process.clockGettime(Process.CLOCK_MONOTONIC) - Trails.configuration!.x.bootedAt,
    );
  }
}
