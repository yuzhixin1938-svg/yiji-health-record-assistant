import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import { RecordFileStorageService } from "../apps/api/src/records/record-file-storage.service.js";

config({ path: ".env.production.local", override: false });
config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

function maskOssPath(storagePath: string): string {
  return storagePath.replace(/^oss:\/\/[^/]+\//, "oss://[bucket]/");
}

async function main() {
  const storage = new RecordFileStorageService();
  await storage.checkAliyunOssConfig();

  const directory = await mkdtemp(join(tmpdir(), "yiji-oss-smoke-"));
  const localPath = join(directory, "oss-smoke.txt");
  const content = `yiji oss smoke ${new Date().toISOString()}`;

  try {
    await writeFile(localPath, content, "utf8");
    const stored = await storage.store({
      memberId: "oss-smoke-test",
      localPath,
      originalName: "oss-smoke.txt",
      mimeType: "text/plain",
    });

    if (stored.storageProvider !== "aliyun_oss_private") {
      throw new Error(`OSS 未启用，当前存储方式为 ${stored.storageProvider}`);
    }

    const readBack = await storage.read(stored.storagePath);
    if (readBack.toString("utf8") !== content) {
      throw new Error("OSS 读取内容与上传内容不一致");
    }

    await storage.delete(stored.storagePath);

    let deleted = false;
    try {
      await storage.read(stored.storagePath);
    } catch {
      deleted = true;
    }
    if (!deleted) {
      throw new Error("OSS 删除后仍可读取对象");
    }

    console.log("OSS_STORE=ok");
    console.log("OSS_READ=ok");
    console.log("OSS_DELETE=ok");
    console.log(`STORAGE_PATH=${maskOssPath(stored.storagePath)}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await main();
