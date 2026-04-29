// Drizzle + Neon serverless driver.
// `db` is a lazy Proxy — env vars are only read on first actual query, so
// scripts that load .env.local at runtime work even though static imports
// are hoisted above the dotenv config() call.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleClient | null = null;

function getDb(): DrizzleClient {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Provision Vercel Postgres and add to .env.local.",
    );
  }
  _db = drizzle(neon(process.env.DATABASE_URL), { schema });
  return _db;
}

export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
