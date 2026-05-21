import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/nodes.yml
export const nodeFixtureData = {
  grandparent: {
    id: 1,
    tree_id: ref("trees", "root"),
    name: "Grand Parent",
  },
  parent_a: {
    id: 2,
    tree_id: ref("trees", "root"),
    parent_id: ref("nodes", "grandparent"),
    name: "Parent A",
  },
  parent_b: {
    id: 3,
    tree_id: ref("trees", "root"),
    parent_id: ref("nodes", "grandparent"),
    name: "Parent B",
  },
  child_one_of_a: {
    id: 4,
    tree_id: ref("trees", "root"),
    parent_id: ref("nodes", "parent_a"),
    name: "Child one",
  },
  child_two_of_b: {
    id: 5,
    tree_id: ref("trees", "root"),
    parent_id: ref("nodes", "parent_a"),
    name: "Child two",
  },
};
