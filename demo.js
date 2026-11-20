// =====================================================================
//  demo.js  —  CUE CARD for the live screencast (copy-paste one block at a time)
//  Start:   cd mongodb-demo  &&  mongosh "<connection string>"
//           load("helpers.js")
//  Retake:  load("reset.js")   (puts the DB back to the post-seed state)
// =====================================================================


// ---------- SCENE 1 · Architecture: a replica set, not a single server (Wk 2, Wk 10) ----------
var h = db.hello(); ({ replicaSet: h.setName, primary: h.primary, members: h.hosts })


// ---------- SCENE 2 · Document model = NF² (Wk 4/5: non-atomic, nested values) ----------
db.resale.findOne()
db.resale.countDocuments()


// ---------- SCENE 3a · Flexible schema: a differently shaped document is accepted ----------
db.resale.insertOne({
  month: "2025-11", price: 688000,
  flat: { type: "4 ROOM", area_sqm: 93, storey: "10 TO 12" },
  address: { block: "123A", street: "TAMPINES ST 11", town: "TAMPINES" },
  features: ["renovated", "near MRT"],               // array value
  agent: { name: "J. Tan", licence: "R012345" }      // field no other doc has
})

// ---------- SCENE 3b · ...but schema can be enforced on demand ($jsonSchema validator) ----------
db.runCommand({ collMod: "resale", validator: { $jsonSchema: {
  required: ["month", "price", "address"],
  properties: {
    price:   { bsonType: "number", minimum: 0 },
    address: { bsonType: "object", required: ["town"] }
  }
}}}).ok

db.resale.insertOne({ month: "2025-11", price: "about 600k", address: { town: "TAMPINES" } })
// -> MongoServerError: Document failed validation

// FALLBACK only if collMod says "not authorized" (Atlas user lacks the "Atlas admin" role):
// db.createCollection("listings", { validator: { $jsonSchema: { required: ["price"], properties: { price: { bsonType: "number", minimum: 0 } } } } })
// db.listings.insertOne({ price: "about 600k" })


// ---------- SCENE 4a · Aggregation pipeline ≈ relational algebra (Wk 7/8) ----------
// SQL: SELECT town, AVG(price), COUNT(*) FROM resale
//      WHERE flat_type = '4 ROOM' AND month BETWEEN '2024-01' AND '2024-12'
//      GROUP BY town ORDER BY AVG(price) DESC LIMIT 5;
db.resale.aggregate([
  { $match: { "flat.type": "4 ROOM", month: { $gte: "2024-01", $lte: "2024-12" } } },  // σ  WHERE
  { $group: { _id: "$address.town", avgPrice: { $avg: "$price" }, n: { $sum: 1 } } },  // γ  GROUP BY
  { $sort:  { avgPrice: -1 } },                                                         //    ORDER BY
  { $limit: 5 },                                                                        //    LIMIT
  { $project: { _id: 0, town: "$_id", avgPrice: { $round: ["$avgPrice", -3] }, n: 1 } } // π  SELECT
])

// ---------- SCENE 4b · Join with a "dimension" + roll-up town -> region (Wk 6/9) ----------
db.resale.aggregate([
  { $match:  { month: { $gte: "2024-01", $lte: "2024-12" } } },
  { $group:  { _id: "$address.town", total: { $sum: "$price" }, n: { $sum: 1 } } },     // 100k docs -> 26 rows first
  { $lookup: { from: "towns", localField: "_id", foreignField: "_id", as: "t" } },      // ⋈  (left outer join)
  { $unwind: "$t" },
  { $group:  { _id: "$t.region", total: { $sum: "$total" }, n: { $sum: "$n" } } },      // roll-up
  { $project:{ _id: 0, region: "$_id", n: 1, avgPrice: { $round: [{ $divide: ["$total", "$n"] }, -3] } } },
  { $sort:   { avgPrice: -1 } }
])


// ---------- SCENE 5 · Indexes + query processing via explain() (Wk 11/12) ----------
var q = { "address.town": "TAMPINES", "flat.type": "4 ROOM", price: { $gte: 600000 } }

plan(db.resale.find(q).explain("executionStats"))                 // 1) no index -> COLLSCAN (full scan)

db.resale.createIndex({ "address.town": 1, "flat.type": 1, price: 1 })   // composite key: equality fields first, range last

plan(db.resale.find(q).explain("executionStats"))                 // 2) IXSCAN -> FETCH

plan(db.resale.find(q, { _id: 0, "address.town": 1, "flat.type": 1, price: 1 })
       .explain("executionStats"))                                // 3) covered = index-only: docsExamined 0

// ---------- SCENE 5b (optional) · key ORDER matters, and the planner races candidate plans ----------
db.resale.createIndex({ price: 1, "address.town": 1, "flat.type": 1 })
plan(db.resale.find(q).hint({ price: 1, "address.town": 1, "flat.type": 1 }).explain("executionStats"))  // many more keys
plan(db.resale.find(q).explain("executionStats"))                 // planner picks the ESR index, rejectedPlans >= 1


// ---------- SCENE 6 · A non-B-tree index: geospatial 2dsphere ----------
db.hawker_centres.createIndex({ location: "2dsphere" })
var home = db.resale.findOne({ "address.town": "TAMPINES", "address.location": { $exists: true } }).address

db.hawker_centres.aggregate([
  { $geoNear: { near: home.location, distanceField: "metres", maxDistance: 3000 } },  // uses the 2dsphere index
  { $limit: 3 },
  { $project: { _id: 0, name: 1, stalls: 1, metres: { $round: ["$metres", 0] } } }
])


// ---------- SCENE 7 (optional, not needed in the video) · multi-document ACID transaction ----------
var s = db.getMongo().startSession();
var sdb = s.getDatabase("hdb_demo");
s.startTransaction();
sdb.towns.updateOne({ _id: "PUNGGOL" }, { $set: { note: "demo" } });
sdb.hawker_centres.updateMany({ town: "PUNGGOL" }, { $inc: { stalls: 1 } });
s.abortTransaction();          // all-or-nothing: neither update is visible afterwards
db.towns.findOne({ _id: "PUNGGOL" })         // -> no "note" field
