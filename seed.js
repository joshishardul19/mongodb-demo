// =====================================================================
//  seed.js  —  builds the demo database "hdb_demo" for the MongoDB review
//  Run once (takes ~10–60 s depending on network):
//      mongosh "<your connection string>" seed.js
//  or, from inside mongosh:   load("seed.js")
//
//  Data is SYNTHETIC but shaped like the data.gov.sg HDB resale dataset
//  (same towns / flat types / storey ranges), so it mirrors the SD6103
//  PostgreSQL project domain. Deterministic: same seed -> same data.
// =====================================================================

const N_DOCS = 100000;          // resale transactions (lower to 20000 if your network is slow)
const BATCH  = 5000;

db = db.getSiblingDB("hdb_demo");
db.dropDatabase();

// ---------- deterministic PRNG (mulberry32) ----------
let _s = 6103;
function rnd() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick  = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
function weighted(pairs) {               // [[value, weight], ...]
  const tot = pairs.reduce((s, p) => s + p[1], 0);
  let r = rnd() * tot;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

// ---------- dimension: towns (approximate centroids, URA region) ----------
// [town, region, lat, lng, base price per sqm (2019, synthetic), typical lease-start decade, weight]
const TOWNS = [
  ["ANG MO KIO","North-East",1.3691,103.8454,4700,1978,6], ["BEDOK","East",1.3236,103.9273,4500,1980,7],
  ["BISHAN","Central",1.3526,103.8352,5600,1988,3],        ["BUKIT BATOK","West",1.3590,103.7637,4200,1986,5],
  ["BUKIT MERAH","Central",1.2819,103.8239,5800,1982,5],   ["BUKIT PANJANG","West",1.3774,103.7719,4300,1995,4],
  ["BUKIT TIMAH","Central",1.3294,103.8021,6000,1985,1],   ["CENTRAL AREA","Central",1.2903,103.8520,6800,1990,1],
  ["CHOA CHU KANG","West",1.3840,103.7470,4100,1994,5],    ["CLEMENTI","West",1.3162,103.7649,5200,1980,3],
  ["GEYLANG","Central",1.3201,103.8918,4800,1982,3],       ["HOUGANG","North-East",1.3612,103.8863,4300,1990,6],
  ["JURONG EAST","West",1.3329,103.7436,4400,1985,3],      ["JURONG WEST","West",1.3404,103.7090,4100,1992,8],
  ["KALLANG/WHAMPOA","Central",1.3100,103.8651,5300,1985,3],["MARINE PARADE","Central",1.3020,103.9070,5400,1977,1],
  ["PASIR RIS","East",1.3721,103.9474,4300,1993,4],        ["PUNGGOL","North-East",1.3984,103.9072,4600,2012,6],
  ["QUEENSTOWN","Central",1.2942,103.7861,6100,1980,3],    ["SEMBAWANG","North",1.4491,103.8185,4000,2001,3],
  ["SENGKANG","North-East",1.3868,103.8914,4500,2004,8],   ["SERANGOON","North-East",1.3554,103.8679,4700,1988,2],
  ["TAMPINES","East",1.3496,103.9568,4600,1988,8],         ["TOA PAYOH","Central",1.3343,103.8563,5300,1978,3],
  ["WOODLANDS","North",1.4382,103.7890,3900,1995,7],       ["YISHUN","North",1.4304,103.8354,4100,1988,7],
];

db.towns.insertMany(TOWNS.map(([town, region, lat, lng]) => ({
  _id: town,                                   // natural key, like a PRIMARY KEY
  region: region,
  centroid: { type: "Point", coordinates: [lng, lat] },
})));

// ---------- blocks per town (used to give each sale an address + location) ----------
const STREET_KINDS = ["AVE", "ST", "DR", "RD", "CRES"];
const blocksByTown = {};
for (const [town, , lat, lng, , leaseDecade] of TOWNS) {
  const prefix = town.split(/[ /]/)[0];
  const blocks = [];
  for (let i = 0; i < 40; i++) {
    const no = String(randInt(100, 899)) + (rnd() < 0.12 ? pick(["A", "B", "C"]) : "");
    blocks.push({
      block: no,
      street: `${prefix} ${pick(STREET_KINDS)} ${randInt(1, 72)}`,
      lat: lat + (rnd() - 0.5) * 0.024,     // ~ ±1.3 km jitter around the centroid
      lng: lng + (rnd() - 0.5) * 0.024,
      lease_start: Math.min(2019, leaseDecade + randInt(-6, 8)),
    });
  }
  blocksByTown[town] = blocks;
}

// ---------- fact: resale transactions ----------
const FLAT = {   // type: [mean sqm, share, models]
  "2 ROOM":    [45,  3,  ["Standard", "Model A", "2-room"]],
  "3 ROOM":    [67,  25, ["New Generation", "Improved", "Model A"]],
  "4 ROOM":    [92,  40, ["Model A", "Premium Apartment", "Simplified"]],
  "5 ROOM":    [112, 24, ["Improved", "Premium Apartment", "Standard"]],
  "EXECUTIVE": [142, 8,  ["Apartment", "Maisonette"]],
};
const FEATURES = ["corner unit", "renovated", "near MRT", "high floor", "unblocked view"];
const townPick = TOWNS.map(t => [t, t[6]]);
const typePick = Object.keys(FLAT).map(k => [k, FLAT[k][1]]);

let buf = [];
for (let i = 0; i < N_DOCS; i++) {
  const t = weighted(townPick);
  const [town, , , , psm] = t;
  const b = pick(blocksByTown[town]);
  const ftype = weighted(typePick);
  const [meanArea, , models] = FLAT[ftype];
  const area = Math.round(meanArea * (0.9 + rnd() * 0.2));
  const maxStorey = town === "CENTRAL AREA" || town === "BUKIT MERAH" ? 40 : 16;
  const lo = 3 * randInt(0, Math.floor(maxStorey / 3) - 1) + 1;
  const storey = `${String(lo).padStart(2, "0")} TO ${String(lo + 2).padStart(2, "0")}`;
  const year = randInt(2019, 2025), mon = randInt(1, 12);
  const yearF = 1 + 0.065 * (year - 2019);                 // synthetic price trend
  const leaseF = 1 - 0.006 * (year - b.lease_start - 10);
  const price = Math.round(psm * area * yearF * leaseF * (1 + 0.01 * lo) * (0.92 + rnd() * 0.16) / 1000) * 1000;

  const doc = {
    month: `${year}-${String(mon).padStart(2, "0")}`,
    price: price,
    flat: { type: ftype, model: pick(models), area_sqm: area, storey: storey },
    address: {
      block: b.block, street: b.street, town: town,
      location: { type: "Point", coordinates: [+b.lng.toFixed(5), +b.lat.toFixed(5)] },
    },
    lease_start: b.lease_start,
  };
  if (rnd() < 0.06) {                                       // optional field on ~6% of docs
    doc.features = [...new Set([pick(FEATURES), pick(FEATURES)])];
  }
  buf.push(doc);
  if (buf.length === BATCH) { db.resale.insertMany(buf, { ordered: false }); buf = []; }
}
if (buf.length) db.resale.insertMany(buf, { ordered: false });

// ---------- hawker centres (synthetic names + locations) ----------
const CUISINES = ["Chinese", "Malay", "Indian", "Western", "Peranakan", "Desserts", "Drinks"];
const hawkers = [];
for (const [town, , lat, lng] of TOWNS) {
  const pretty = town.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const k = randInt(2, 4);
  for (let j = 1; j <= k; j++) {
    hawkers.push({
      name: `${pretty} Hawker Centre ${j}`,
      town: town,
      location: { type: "Point", coordinates: [+(lng + (rnd() - 0.5) * 0.03).toFixed(5), +(lat + (rnd() - 0.5) * 0.03).toFixed(5)] },
      stalls: randInt(20, 120),
      cuisines: [...new Set([pick(CUISINES), pick(CUISINES), pick(CUISINES)])],
    });
  }
}
db.hawker_centres.insertMany(hawkers);

print(`hdb_demo ready: resale=${db.resale.countDocuments()}, towns=${db.towns.countDocuments()}, hawker_centres=${db.hawker_centres.countDocuments()}`);
print("Indexes on resale (should be only _id_): " + db.resale.getIndexes().map(i => i.name).join(", "));
