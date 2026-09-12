/** @noRailsEquivalent PERMANENT MOVED-BY-SHORT-NAME: useTransactionalTests. */
import { leaseFixtureConnection } from "./fixture-connection.js";
import {
  withTransactionalFixtures,
  type WithTransactionalFixturesOptions,
} from "./with-transactional-fixtures.js";

export function useTransactionalTests(options?: WithTransactionalFixturesOptions): void {
  withTransactionalFixtures(leaseFixtureConnection, options);
}
