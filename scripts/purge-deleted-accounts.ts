import "dotenv/config";
import { PrismaService } from "../apps/api/src/database/prisma.service.js";
import { AccountService } from "../apps/api/src/account/account.service.js";
import { RecordFileStorageService } from "../apps/api/src/records/record-file-storage.service.js";

const confirm = process.argv.includes("--confirm");
const prisma = new PrismaService();
const account = new AccountService(prisma, new RecordFileStorageService());

try {
  const result = await account.purgeDeletionPendingUsers({ dryRun: !confirm });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!confirm) {
    process.stdout.write("未实际删除。确认执行请运行：npm run accounts:purge -- --confirm\n");
  }
} finally {
  await prisma.$disconnect();
}
