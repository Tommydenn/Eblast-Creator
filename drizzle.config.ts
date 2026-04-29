// Drizzle Kit config — used by `drizzle-kit push`, `drizzle-kit generate`,
// and `drizzle-kit studio`. Loads env from .env.local.

import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config({ path: ".env.local" });

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
