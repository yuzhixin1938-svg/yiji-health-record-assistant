import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { loadEnvironment } from "../config/environment.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const environment = loadEnvironment();
    const adapter = new PrismaPg({ connectionString: normalizeDatabaseUrl(environment.DATABASE_URL) });
    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}

function normalizeDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.protocol === "postgresql:" || url.protocol === "postgres:") {
    if (url.searchParams.get("sslmode") === "require") {
      url.searchParams.set("sslmode", "verify-full");
    }
  }
  return url.toString();
}
