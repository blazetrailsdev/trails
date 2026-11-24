/**
 * The native side of the app. electron/main.ts installs an Electron-backed
 * shell before the window opens; in tests and under `trails server` it is
 * null, and the controllers that need it say so instead of failing.
 */
export interface DesktopShell {
  /** Shows an open dialog for any files and answers the chosen paths. */
  pickFiles(): Promise<string[]>;
  /** Shows an open dialog for one JSON or CSV file. */
  pickImportFile(): Promise<string | null>;
  /** Shows a save dialog and answers the chosen path. */
  pickExportPath(defaultName: string): Promise<string | null>;
  /** Opens a file with the OS's default application. */
  openPath(path: string): Promise<void>;
  /** Posts a system notification. */
  notify(title: string, body: string): void;
}

export class Desktop {
  static shell: DesktopShell | null = null;
}
