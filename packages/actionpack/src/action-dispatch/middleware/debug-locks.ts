import { Dependencies, type ShareLockThreadInfo } from "@blazetrails/activesupport";
import { rbFSend, rbInspect } from "@blazetrails/ruby-compat";
import { bodyFromString, CONTENT_TYPE, CONTENT_LENGTH } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Request } from "../http/request.js";
import { Response } from "../http/response.js";

export class DebugLocks {
  private app: RackApp;
  private path: string;

  constructor(app: RackApp, path = "/rails/locks") {
    this.app = app;
    this.path = path;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const req = new Request(env);

    if (req.isGet()) {
      const path = req.pathInfo.replace(/\/$/, "");
      if (path === this.path) {
        return this.renderDetails(req);
      }
    }

    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }

  /** @internal */
  private async renderDetails(req: Request): Promise<RackResponse> {
    const threads = await Dependencies.interlock.rawState((rawThreads) => {
      let idx = 0;
      for (const [thread, info] of rawThreads) {
        info.index = idx++;
        info.backtrace = thread.backtrace();
      }
      return rawThreads;
    });

    const parts: string[] = [];

    for (const [thread, info] of threads) {
      let lockState: string;
      if (info.exclusive) {
        lockState = "Exclusive";
      } else if (info.sharing > 0) {
        lockState = "Sharing";
        if (info.sharing > 1) lockState += ` x${info.sharing}`;
      } else {
        lockState = "No lock";
      }

      if (info.waiting) {
        lockState += " (yielded share)";
      }

      const status = thread.status || "dead";
      let msg = `Thread ${info.index} [0x${thread.id.toString(16)} ${status}]  ${lockState}\n`;

      if (info.sleeper) {
        msg += `  Waiting in ${String(info.sleeper)}`;
        if (info.purpose != null) msg += ` to ${rbInspect(String(info.purpose))}`;
        msg += "\n";

        if (info.compatible) {
          const compat = info.compatible.map((c) => (c === false ? "share" : rbInspect(String(c))));
          msg += `  may be pre-empted for: ${compat.join(", ")}\n`;
        }

        const blockers = Array.from(threads.values()).filter((binfo) =>
          this.blockedBy(info, binfo, threads.values()),
        );
        if (blockers.length) {
          msg += `  blocked by: ${blockers.map((i) => i.index).join(", ")}\n`;
        }
      }

      const blockees = Array.from(threads.values()).filter((binfo) =>
        this.blockedBy(binfo, info, threads.values()),
      );
      if (blockees.length) {
        msg += `  blocking: ${blockees.map((i) => i.index).join(", ")}\n`;
      }

      if (info.backtrace) {
        msg += `\n${info.backtrace.join("\n")}\n`;
      }

      parts.push(msg);
    }

    const str = parts.join("\n\n---\n\n\n");

    return [
      200,
      {
        [CONTENT_TYPE]: `text/plain; charset=${Response.defaultCharset}`,
        [CONTENT_LENGTH]: Buffer.byteLength(str, "utf-8").toString(),
      },
      bodyFromString(str),
    ];
  }

  /** @internal */
  private blockedBy(
    victim: ShareLockThreadInfo,
    blocker: ShareLockThreadInfo,
    allThreads: Iterable<ShareLockThreadInfo>,
  ): boolean {
    if (victim === blocker) return false;

    switch (victim.sleeper) {
      case "start_sharing":
        return (
          !!blocker.exclusive ||
          (!victim.waiting && !!blocker.compatible && !blocker.compatible.includes(false))
        );
      case "start_exclusive":
        return (
          blocker.sharing > 0 ||
          !!blocker.exclusive ||
          (!!blocker.compatible && !blocker.compatible.includes(victim.purpose))
        );
      case "yield_shares":
        return !!blocker.exclusive;
      case "stop_exclusive":
        return (
          !!blocker.exclusive ||
          (!!victim.compatible &&
            victim.compatible.includes(blocker.purpose) &&
            Array.from(allThreads).every(
              (other) =>
                !other.compatible ||
                other === blocker ||
                other.compatible.includes(blocker.purpose),
            ))
        );
      default:
        return false;
    }
  }
}
