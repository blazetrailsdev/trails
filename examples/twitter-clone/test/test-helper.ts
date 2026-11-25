import { TestCase } from "@blazetrails/activesupport/test-case";
import { env, setEnv } from "@blazetrails/ruby-compat";

if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
await import("../config/environment.ts");
await import("@blazetrails/trailties/test-help");

// Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
TestCase.fixtures(":all");

// Add more helper methods to be used by all tests here...

const { Follow } = await import("../app/models/follow.ts");
const { Like } = await import("../app/models/like.ts");
const { Tweet } = await import("../app/models/tweet.ts");
const { User } = await import("../app/models/user.ts");

/** Empties the app's tables, children first, so each test starts from a blank database. */
export async function resetDatabase(): Promise<void> {
  for (const model of [Like, Follow, Tweet, User]) await model.deleteAll();
}

const { IntegrationTest } = await import("@blazetrails/actionpack/testing");
const { ActionDispatch } = await import("@blazetrails/actionpack");

/**
 * Integration tests run against the booted application. `app` is overridden
 * because `IntegrationTest#app` recurses without it (story
 * integration-test-app-recurses-without-override).
 */
export class ApplicationIntegrationTest extends IntegrationTest {
  override get app() {
    return ActionDispatch.testApp as never;
  }
}
