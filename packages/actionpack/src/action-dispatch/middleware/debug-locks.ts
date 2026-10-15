import { Dependencies, type ShareLockThreadInfo } from "@blazetrails/activesupport";
import { rbFSend } from "@blazetrails/ruby-compat";
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
  private renderDetails(req: Request): RackResponse {
    const threads = Dependencies.interlock.rawState((rawThreads) => {
      let idx = 0;
      for (const [thread, info] of rawThreads) {
        info.index = idx++;
        info.backtrace = thread.backtrace();
      }
      return rawThreads;
    });

    const allInfos = Array.from(threads.values());
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
        if (info.purpose != null) msg += ` to ${JSON.stringify(String(info.purpose))}`;
        msg += "\n";

        if (info.compatible) {
          const compat = info.compatible.map((c) =>
            c === false ? "share" : JSON.stringify(String(c)),
          );
          msg += `  may be pre-empted for: ${compat.join(", ")}\n`;
        }

        const blockers = allInfos.filter((binfo) => this.blockedBy(info, binfo, allInfos));
        if (blockers.length) {
          msg += `  blocked by: ${blockers.map((i) => i.index).join(", ")}\n`;
        }
      }

      const blockees = allInfos.filter((binfo) => this.blockedBy(binfo, info, allInfos));
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
    allThreads: ShareLockThreadInfo[],
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
            allThreads.every(
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
