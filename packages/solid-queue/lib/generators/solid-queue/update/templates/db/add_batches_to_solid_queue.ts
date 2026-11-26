import { Migration } from "@blazetrails/activerecord";

export class AddBatchesToSolidQueue extends Migration.get(7.1) {
  async change(): Promise<void> {
    // Fresh installs create all of this with the base schema, so skip
    // anything that already exists
    await this.addColumn("solid_queue_jobs", "batch_id", "bigint", { ifNotExists: true });
    await this.addIndex("solid_queue_jobs", "batch_id", { ifNotExists: true });

    await this.createTable("solid_queue_batches", { ifNotExists: true }, (t) => {
      t.string("active_job_batch_id");
      t.string("description");
      t.text("on_finish");
      t.text("on_success");
      t.text("on_failure");
      t.text("metadata");
      t.integer("total_jobs", { default: 0, null: false });
      t.integer("completed_jobs", { default: 0, null: false });
      t.integer("failed_jobs", { default: 0, null: false });
      t.datetime("enqueued_at");
      t.datetime("finished_at");
      t.datetime("failed_at");
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });

      t.index("active_job_batch_id", { unique: true });
      t.index("finished_at");
    });

    await this.createTable("solid_queue_batch_executions", { ifNotExists: true }, (t) => {
      t.bigint("job_id", { null: false });
      t.bigint("batch_id", { null: false });
      t.datetime("created_at", { null: false });

      t.index("job_id", { unique: true });
      t.index("batch_id");
      t.foreignKey("solid_queue_batches", { column: "batch_id", onDelete: "cascade" });
      t.foreignKey("solid_queue_jobs", { column: "job_id", onDelete: "cascade" });
    });
  }
}
