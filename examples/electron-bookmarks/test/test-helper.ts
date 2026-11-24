import { env, setEnv } from "@blazetrails/ruby-compat";

if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
await import("../config/environment.ts");
await import("@blazetrails/trailties/test-help");

const { Base } = await import("@blazetrails/activerecord");
// Boot warms the schema cache in every env but test (active_record.initialize_database),
// so the tests warm it here before any model is built with `new`.
const pool = Base.connectionPool();
await pool.schemaReflection.loadAllBang(pool);

const { Bookmark } = await import("../app/models/bookmark.ts");
const { Tag } = await import("../app/models/tag.ts");
const { Tagging } = await import("../app/models/tagging.ts");
const { Attachment } = await import("../app/models/attachment.ts");
const { Desktop } = await import("../app/models/desktop.ts");
type DesktopShell = import("../app/models/desktop.ts").DesktopShell;

/** Empties the app's tables, children first, so each test starts from a blank database. */
export async function resetDatabase(): Promise<void> {
  for (const model of [Attachment, Tagging, Tag, Bookmark]) await model.deleteAll();
  Desktop.shell = null;
}

/** Installs a fake Electron shell whose dialogs answer what each test sets. */
export function fakeDesktop(overrides: Partial<DesktopShell> = {}) {
  const calls = { opened: [] as string[], notified: [] as string[] };
  const shell: DesktopShell = {
    pickFiles: async () => [],
    pickImportFile: async () => null,
    pickExportPath: async () => null,
    openPath: async (path) => {
      calls.opened.push(path);
    },
    notify: (title, body) => {
      calls.notified.push(`${title}: ${body}`);
    },
    ...overrides,
  };
  Desktop.shell = shell;
  return calls;
}

const { IntegrationTest } = await import("@blazetrails/actionpack/testing");
const { ActionDispatch } = await import("@blazetrails/actionpack");

/**
 * `app` is overridden because `IntegrationTest#app` recurses without it (story
 * integration-test-app-recurses-without-override).
 */
export class ApplicationIntegrationTest extends IntegrationTest {
  override get app() {
    return ActionDispatch.testApp as never;
  }
}
