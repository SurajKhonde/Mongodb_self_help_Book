# config

## Folder layout

```text
src/
  config/
    index.ts        // ONE entry point to import everywhere
  server.ts
.env
.env.development
.env.production

```

`src/config/index.ts`

```ts
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";
import bunyan from "bunyan";
import cloudinary from "cloudinary";

// 1) Load env once (pick file by NODE_ENV if you want)
const nodeEnv = process.env.NODE_ENV ?? "development";
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${nodeEnv}`), // falls back if file missing
});
dotenv.config(); // also load plain .env (optional)

// 2) Schema (typed + validation)
const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),

  DATABASE_URL: z.string().default("mongodb://localhost:27017/app"),
  JWT_TOKEN: z.string().min(10, "JWT_TOKEN must be at least 10 chars"),

  SECRET_KEY_ONE: z.string().min(10),
  SECRET_KEY_TWO: z.string().min(10),

  CLIENT_URL: z.string().url(),
  REDIS_HOST: z.string().min(1), // e.g. redis://localhost:6379

  CLOUD_NAME: z.string().min(1).optional(),
  CLOUD_API_KEY: z.string().min(1).optional(),
  CLOUD_API_SECRET: z.string().min(1).optional(),

  SENDGRID_API_KEY: z.string().min(1).optional(),
  SENDGRID_SENDER: z.string().email().optional(),

  SENDER_EMAIL: z.string().email().optional(),
  SENDER_EMAIL_PASSWORD: z.string().min(1).optional(),

  EC2_URL: z.string().url().optional(),

  SERVER_PORT: z.coerce.number().int().positive().default(5000),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // prints all missing/invalid env vars clearly
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// 3) Export ONE frozen config object
export const config = Object.freeze({
  ...parsed.data,

  // helpers stay here too
  createLogger(name: string) {
    return bunyan.createLogger({
      name,
      level: config.NODE_ENV === "production" ? "info" : "debug",
    });
  },

  initCloudinary() {
    // only configure if values exist
    if (config.CLOUD_NAME && config.CLOUD_API_KEY && config.CLOUD_API_SECRET) {
      cloudinary.v2.config({
        cloud_name: config.CLOUD_NAME,
        api_key: config.CLOUD_API_KEY,
        api_secret: config.CLOUD_API_SECRET,
      });
    }
  },
});

```

`Usage anywhere (example)`

```ts
import { config } from "./config";

const log = config.createLogger("server");

log.info({ env: config.NODE_ENV }, "starting...");
config.initCloudinary();

console.log("Redis:", config.REDIS_HOST);
console.log("Port:", config.SERVER_PORT);

```
