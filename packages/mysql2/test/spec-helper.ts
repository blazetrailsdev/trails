import { TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeAll, beforeEach } from "vitest";
import { Mysql2, type Client } from "../lib/index.js";

const ENV = TopLevel.ENV!;
const DatabaseCredentials = {
  root: { host: ENV["MYSQL_HOST"] ?? "localhost", port: Number(ENV["MYSQL_PORT"] ?? 3306) },
};

let clients: Client[] = [];

export async function newClient(optionOverrides: object = {}): Promise<Client> {
  const client = await Mysql2.Client.new({
    ...DatabaseCredentials.root,
    username: "rails",
    database: "activerecord_unittest",
    ...optionOverrides,
  });
  clients.push(client);
  return client;
}

export function specHelper(): { client: Client } {
  const state = {} as { client: Client };
  beforeAll(async () => {
    const client = await newClient();
    await client.query(`
      CREATE TABLE IF NOT EXISTS mysql2_test (
        id MEDIUMINT NOT NULL AUTO_INCREMENT, null_test VARCHAR(10), bit_test BIT(64),
        single_bit_test BIT(1), tiny_int_test TINYINT, bool_cast_test TINYINT(1),
        small_int_test SMALLINT, medium_int_test MEDIUMINT, int_test INT, big_int_test BIGINT,
        float_test FLOAT(10,3), float_zero_test FLOAT(10,3), double_test DOUBLE(10,3),
        decimal_test DECIMAL(10,3), decimal_zero_test DECIMAL(10,3), date_test DATE,
        date_time_test DATETIME, timestamp_test TIMESTAMP, time_test TIME, year_test YEAR(4),
        char_test CHAR(10), varchar_test VARCHAR(10), binary_test BINARY(10),
        varbinary_test VARBINARY(10), tiny_blob_test TINYBLOB, tiny_text_test TINYTEXT,
        blob_test BLOB, text_test TEXT, medium_blob_test MEDIUMBLOB, medium_text_test MEDIUMTEXT,
        long_blob_test LONGBLOB, long_text_test LONGTEXT, enum_test ENUM('val1', 'val2'),
        set_test SET('val1', 'val2'), PRIMARY KEY (id)
      )`);
    const lock = (await client.query("SELECT GET_LOCK('mysql2_test', 60) AS l"))!.toA()[0] as {
      l: unknown;
    };
    if (lock.l !== 1) throw new Error("could not acquire the mysql2_test reseed lock");
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM mysql2_test;");
      await client.query(`
      INSERT INTO mysql2_test (
        null_test, bit_test, single_bit_test, tiny_int_test, bool_cast_test, small_int_test,
        medium_int_test, int_test, big_int_test, float_test, float_zero_test, double_test,
        decimal_test, decimal_zero_test, date_test, date_time_test, timestamp_test, time_test,
        year_test, char_test, varchar_test, binary_test, varbinary_test, tiny_blob_test,
        tiny_text_test, blob_test, text_test, medium_blob_test, medium_text_test,
        long_blob_test, long_text_test, enum_test, set_test
      ) VALUES (
        NULL, b'101', b'1', 1, 1, 10, 10, 10, 10,
        10.3, 0, 10.3, 10.3, 0, '2010-4-4', '2010-4-4 11:44:00', '2010-4-4 11:44:00', '11:44:00',
        2009, "test", "test", "test", "test", "test",
        "test", "test", "test", "test", "test",
        "test", "test", 'val1', 'val1,val2'
      )`);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      await client.query("SELECT RELEASE_LOCK('mysql2_test')");
      await client.close();
    }
    clients = [];
  });
  beforeEach(async () => {
    state.client = await newClient();
  });
  afterEach(async () => {
    for (const c of clients) if (!c.isClosed()) await c.close();
    clients = [];
  });
  return state;
}

/** @noRailsEquivalent PERMANENT */
export function lastIdTestLock(state: { client: Client }): void {
  beforeEach(async () => {
    const lock = (await state.client.query("SELECT GET_LOCK('lastIdTest', 60) AS l"))!.toA()[0] as {
      l: unknown;
    };
    if (lock.l !== 1) throw new Error("could not acquire the lastIdTest lock");
  });
  afterEach(async () => {
    if (!state.client.isClosed()) await state.client.query("SELECT RELEASE_LOCK('lastIdTest')");
  });
}
