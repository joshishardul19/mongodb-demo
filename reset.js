// =====================================================================
//  reset.js  —  undo everything demo.js changed, so you can re-record a take
//  From inside mongosh:   load("reset.js")
// =====================================================================

db = db.getSiblingDB("hdb_demo");

db.runCommand({ collMod: "resale", validator: {} });                 // remove schema validator
db.resale.deleteMany({ agent: { $exists: true } });                  // doc inserted in scene 3a
db.resale.dropIndexes();                                             // drops all except _id_
db.hawker_centres.dropIndexes();
db.towns.updateMany({}, { $unset: { note: "" } });

print(`reset done: resale=${db.resale.countDocuments()}, resale indexes=[${db.resale.getIndexes().map(i => i.name)}], hawker indexes=[${db.hawker_centres.getIndexes().map(i => i.name)}]`);
