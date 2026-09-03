import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  HOST: z.string().default("127.0.0.1"),
  ALLOWED_ORIGINS: z.string().default("http://127.0.0.1:3001,http://localhost:3001,https://yijijiankang.cn,https://www.yijijiankang.cn"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://yiji:yiji_local_only@localhost:5432/yiji?schema=public"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}
