import { env, setEnv } from "@blazetrails/ruby-compat";

if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
await import("../config/environment.ts");
await import("@blazetrails/trailties/test-help");

const { Base } = await import("@blazetrails/activerecord");
// Boot warms the schema cache in every env but test (active_record.initialize_database),
// so the tests warm it here before any model is built with `new`.
const pool = Base.connectionPool();
await pool.schemaReflection.loadAllBang(pool);

const { User } = await import("../app/models/user.ts");
const { Session } = await import("../app/models/session.ts");
const { Room } = await import("../app/models/room.ts");
const { Membership } = await import("../app/models/membership.ts");
const { Message } = await import("../app/models/message.ts");
const { Reaction } = await import("../app/models/reaction.ts");
const { LinkPreview } = await import("../app/models/link-preview.ts");

/** Empties the app's tables, children first, so each test starts from a blank database. */
export async function resetDatabase(): Promise<void> {
  for (const model of [Reaction, LinkPreview, Message, Membership, Room, Session, User]) {
    await model.deleteAll();
  }
}

const { IntegrationTest } = await import("@blazetrails/actionpack/testing");
const { ActionDispatch } = await import("@blazetrails/actionpack");

/**
 * The app's integration tests run against the booted application. `app` is
 * overridden because `IntegrationTest#app` recurses without it (story
 * integration-test-app-recurses-without-override).
 */
export class ApplicationIntegrationTest extends IntegrationTest {
  override get app() {
    return ActionDispatch.testApp as never;
  }
}
