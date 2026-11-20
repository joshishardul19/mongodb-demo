// =====================================================================
//  helpers.js  —  load once per mongosh session:   load("helpers.js")
//  plan(explainOutput) prints a compact, screen-legible summary of
//  explain("executionStats") instead of 100+ lines of JSON.
// =====================================================================

db = db.getSiblingDB("hdb_demo");

function _chain(node) {
  // Walks the winning-plan tree (classic or SBE shape) -> "FETCH <- IXSCAN"
  const out = [];
  let n = node;
  while (n) {
    if (n.queryPlan) { n = n.queryPlan; continue; }
    if (n.stage) out.push(n.stage + (n.indexName ? `(${n.indexName})` : ""));
    n = n.inputStage || (n.inputStages && n.inputStages[0]) || null;
  }
  return out.join("  <-  ");
}

function plan(ex) {
  // works for find().explain("executionStats") and aggregate explain with a $cursor stage
  let qp = ex.queryPlanner, es = ex.executionStats;
  if (!qp && ex.stages && ex.stages[0].$cursor) {
    qp = ex.stages[0].$cursor.queryPlanner; es = ex.stages[0].$cursor.executionStats;
  }
  const res = {
    winningPlan:   _chain(qp.winningPlan),
    rejectedPlans: (qp.rejectedPlans || []).length,
  };
  if (es) Object.assign(res, {
    nReturned:     es.nReturned,
    keysExamined:  es.totalKeysExamined,
    docsExamined:  es.totalDocsExamined,
    timeMs:        es.executionTimeMillis,
  });
  return res;
}

print("helpers loaded: db = hdb_demo, plan(<explain output>) available");
