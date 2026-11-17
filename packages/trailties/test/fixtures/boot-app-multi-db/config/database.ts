import { env } from "@blazetrails/ruby-compat";

export default {
  development: {
    primary: { adapter: "sqlite3", database: env.BOOT_MULTI_DB_PRIMARY },
    primary_replica: { adapter: "sqlite3", database: env.BOOT_MULTI_DB_PRIMARY, replica: true },
    animals: { adapter: "sqlite3", database: env.BOOT_MULTI_DB_ANIMALS },
  },
};
