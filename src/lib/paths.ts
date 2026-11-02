import path from "node:path";

/** Where the SQLite DB and all generated media live. */
export const DATA_DIR = path.resolve(process.cwd(), "data");
