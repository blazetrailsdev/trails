import { Schema } from "@blazetrails/activerecord";

export async function loadQueueSchema(): Promise<void> {
  await Schema.get(7.1).define({ version: 1 }, async (schema) => {
    await schema.createTable("solid_queue_jobs", { force: "cascade" }, (t) => {
      t.string("queue_name", { null: false });
      t.string("class_name", { null: false });
      t.text("arguments");
      t.integer("priority", { default: 0, null: false });
      t.string("active_job_id");
      t.datetime("scheduled_at");
      t.datetime("finished_at");
      t.string("concurrency_key");
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["active_job_id"], { name: "index_solid_queue_jobs_on_active_job_id" });
      t.index(["class_name"], { name: "index_solid_queue_jobs_on_class_name" });
      t.index(["finished_at"], { name: "index_solid_queue_jobs_on_finished_at" });
      t.index(["queue_name", "finished_at"], { name: "index_solid_queue_jobs_for_filtering" });
      t.index(["scheduled_at", "finished_at"], { name: "index_solid_queue_jobs_for_alerting" });
    });

    await schema.createTable("solid_queue_ready_executions", { force: "cascade" }, (t) => {
      t.bigint("job_id", { null: false });
      t.string("queue_name", { null: false });
      t.integer("priority", { default: 0, null: false });
      t.datetime("created_at", { null: false });
      t.index(["job_id"], { name: "index_solid_queue_ready_executions_on_job_id", unique: true });
      t.index(["priority", "job_id"], { name: "index_solid_queue_poll_all" });
      t.index(["queue_name", "priority", "job_id"], { name: "index_solid_queue_poll_by_queue" });
    });

    await schema.createTable("solid_queue_scheduled_executions", { force: "cascade" }, (t) => {
      t.bigint("job_id", { null: false });
      t.string("queue_name", { null: false });
      t.integer("priority", { default: 0, null: false });
      t.datetime("scheduled_at", { null: false });
      t.datetime("created_at", { null: false });
      t.index(["job_id"], {
        name: "index_solid_queue_scheduled_executions_on_job_id",
        unique: true,
      });
      t.index(["scheduled_at", "priority", "job_id"], { name: "index_solid_queue_dispatch_all" });
    });

    await schema.addForeignKey("solid_queue_ready_executions", "solid_queue_jobs", {
      column: "job_id",
      onDelete: "cascade",
    });
    await schema.addForeignKey("solid_queue_scheduled_executions", "solid_queue_jobs", {
      column: "job_id",
      onDelete: "cascade",
    });
  });
}
