import { ActionController } from "@blazetrails/actionpack";
import { Desktop, type DesktopShell } from "../models/desktop.ts";

export class ApplicationController extends ActionController.Base {
  /**
   * The Electron shell, or null outside the desktop app. Actions that need a
   * native dialog redirect with this alert when there is none.
   */
  protected _desktop(): DesktopShell | null {
    return Desktop.shell;
  }

  protected async _redirectWithoutDesktop(): Promise<void> {
    await this.redirectTo(this.rootPath(), {
      alert: "That needs the desktop app. Run `pnpm start` to open it.",
    });
  }
}
