import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/developers_projects.yml
// HABTM join table — no synthetic id; developer_id + project_id are the composite key.
export const developersProjectsFixtureData = {
  david_action_controller: {
    developer_id: ref("developers", "david"),
    project_id: ref("projects", "action_controller"),
    joined_on: "2004-10-10",
  },
  david_active_record: {
    developer_id: ref("developers", "david"),
    project_id: ref("projects", "active_record"),
    joined_on: "2004-10-10",
  },
  jamis_active_record: {
    developer_id: ref("developers", "jamis"),
    project_id: ref("projects", "active_record"),
  },
  poor_jamis_active_record: {
    developer_id: ref("developers", "poor_jamis"),
    project_id: ref("projects", "active_record"),
  },
};
