import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";

const DB_PATH = path.join(process.cwd(), "src/data/aml.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    sqliteVec.load(_db);
  }
  return _db;
}
