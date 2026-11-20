# Setup

This repo contains a small MongoDB demo: a synthetic dataset of 100,000 public-housing resale transactions, plus scripts that walk through the document model, schema validation, aggregation pipelines, indexing with `explain()`, and geospatial queries.

The data is **synthetic**. It is generated to resemble the structure of Singapore's public HDB resale dataset but contains no real transactions.

Tested with MongoDB 8.0 and `mongosh` 2.14.

> **AI usage:** The scripts and this setup guide were drafted with the help of an AI assistant (Claude) and then reviewed and tested by the author.

## Files

| File | Purpose |
| --- | --- |
| `seed.js` | Builds the `hdb_demo` database: `resale` (100,000 docs), `towns` (26), `hawker_centres` (74). Drops and rebuilds on every run. |
| `helpers.js` | Defines `plan()`, which turns `explain("executionStats")` output into a short summary. |
| `demo.js` | The demo commands, split into scenes. Paste one block at a time into `mongosh`. |
| `reset.js` | Undoes everything `demo.js` changes (indexes, validator, inserted doc), so you can run it again. |

## 1. Create a free MongoDB Atlas cluster

A free Atlas cluster is a three-node replica set, which the first demo scene shows. A local install also works (see [Local alternative](#local-alternative)).

1. Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) and create a cluster on the **Free** tier. Choose the region closest to you.
2. **Database user:** Security → Database Access → Add New Database User → password authentication → built-in role **Atlas admin**. The schema-validation scene uses `collMod`, which the plain read/write role may not allow.
3. **Network access:** Security → Network Access → Add IP Address → **Add Current IP Address**. Avoid `0.0.0.0/0`; if you add it temporarily, remove it afterwards.
4. Copy the connection string: Connect → Shell. It looks like `mongodb+srv://<cluster-name>.<id>.mongodb.net/`.

> **Never commit your connection string, username or password.** The commands below pass only the username, so `mongosh` prompts for the password and it stays out of your shell history and this repo.

## 2. Install the shell

macOS (Homebrew):

```bash
brew install mongosh
brew install --cask mongodb-compass   # optional GUI, includes a visual explain plan
```

Other platforms: see the [mongosh install docs](https://www.mongodb.com/docs/mongodb-shell/install/).

## 3. Load the data

From the repo folder:

```bash
mongosh "mongodb+srv://<cluster-name>.<id>.mongodb.net/" --username <db-user> seed.js
```

Expected output:

```
hdb_demo ready: resale=100000, towns=26, hawker_centres=74
Indexes on resale (should be only _id_): _id_
```

On a slow connection, set `N_DOCS = 20000` at the top of `seed.js`. Every query still works; only the counts change.

## 4. Run the demo

Start an interactive shell **from the repo folder**, so that `load()` can find the files:

```bash
mongosh "mongodb+srv://<cluster-name>.<id>.mongodb.net/" --username <db-user>
```

Then, inside `mongosh`:

```javascript
load("helpers.js")   // prints: helpers loaded: db = hdb_demo, plan(<explain output>) available
```

Open `demo.js` in an editor. Copy one `// ---------- SCENE` block at a time, paste it into `mongosh`, and press Enter. Scene 3b ends with an intentional `Document failed validation` error. Scenes 5b and 7 are optional.

To run it again from a clean state:

```javascript
load("reset.js")
```

## Local alternative

If Atlas is unreachable (some networks block port 27017), run MongoDB locally. On macOS, MongoDB 8.0 Community requires macOS 15 or later:

```bash
brew tap mongodb/brew          # if Homebrew asks: brew trust mongodb/brew
brew install mongodb-community@8.0
brew services start mongodb-community@8.0
mongosh seed.js
```

A default local install is a single standalone server, not a replica set. Scene 1 therefore shows no members, and scene 7 (transactions) needs a replica set.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `mongosh` times out connecting | Your IP isn't on the Atlas Network Access list, or the network blocks port 27017. Try another network or the local alternative. |
| `not authorized ... collMod` in scene 3b | Give the database user the **Atlas admin** role, or use the commented fallback block under scene 3b in `demo.js`. |
| `load("helpers.js")` can't find the file | Start `mongosh` from the repo folder, or pass the full path. |
| `plan is not defined` | You reconnected. Run `load("helpers.js")` again. |
| `createIndex` says the index already exists | Run `load("reset.js")`, then start the scene again. |
| Covered query shows a different stage name | Stage names vary by version (`PROJECTION_DEFAULT` on 8.0). The proof of a covered query is no `FETCH` stage and `docsExamined: 0`. |
| Timings differ from run to run | Expected, especially on shared free-tier hardware. Document and key counts stay the same. |
