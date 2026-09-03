import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { del, get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

type StoredRecordFile = {
  storagePath: string;
  storageProvider: "vercel_blob_private" | "aliyun_oss_private" | "local_disk";
};

type AliOssClient = {
  put: (name: string, file: string | Buffer, options?: { headers?: Record<string, string> }) => Promise<unknown>;
  get: (name: string) => Promise<{ content: Buffer | Uint8Array | string }>;
  delete: (name: string) => Promise<unknown>;
};

const require = createRequire(import.meta.url);
const AliOss = require("ali-oss") as new (options: {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  secure?: boolean;
  internal?: boolean;
}) => AliOssClient;

@Injectable()
export class RecordFileStorageService {
  private ossClient?: AliOssClient;

  async checkAliyunOssConfig(): Promise<void> {
    if (!this.hasAliyunOssConfig()) {
      throw new ServiceUnavailableException("阿里云 OSS 未配置");
    }
  }

  async store(input: {
    memberId: string;
    localPath: string;
    originalName: string;
    mimeType: string;
  }): Promise<StoredRecordFile> {
    if (this.hasAliyunOssConfig()) {
      const pathname = this.pathname(input.memberId, input.originalName);
      await this.getAliyunOssClient().put(pathname, input.localPath, {
        headers: { "Content-Type": input.mimeType },
      });
      return { storagePath: this.ossPath(pathname), storageProvider: "aliyun_oss_private" };
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      if (process.env.VERCEL || process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException("原始资料长期存储未配置，请先连接阿里云 OSS 或 Vercel Blob");
      }
      const storagePath = await this.storeLocal(input.memberId, input.localPath, input.originalName);
      return { storagePath, storageProvider: "local_disk" };
    }

    const pathname = this.pathname(input.memberId, input.originalName);
    const blob = await put(pathname, await readFile(input.localPath), {
      access: "private",
      contentType: input.mimeType,
      allowOverwrite: false,
    });

    return { storagePath: blob.url, storageProvider: "vercel_blob_private" };
  }

  async materialize(storagePath: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
    if (this.isOssPath(storagePath)) {
      const directory = join(tmpdir(), "yiji-medical-records-rerun");
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${Date.now()}-${basename(this.ossKey(storagePath))}`);
      await writeFile(path, await this.read(storagePath));
      return {
        path,
        cleanup: async () => {
          await unlink(path).catch(() => undefined);
        },
      };
    }

    if (!this.isBlobUrl(storagePath)) {
      return { path: storagePath, cleanup: async () => undefined };
    }

    const blob = await get(storagePath, { access: "private", useCache: false });
    if (!blob?.stream) {
      throw new ServiceUnavailableException("原始资料暂时无法读取，请稍后重试");
    }

    const directory = join(tmpdir(), "yiji-medical-records-rerun");
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${Date.now()}-${basename(blob.blob.pathname)}`);
    await writeFile(path, await this.streamToBuffer(blob.stream));

    return {
      path,
      cleanup: async () => {
        await unlink(path).catch(() => undefined);
      },
    };
  }

  async read(storagePath: string): Promise<Buffer> {
    if (this.isOssPath(storagePath)) {
      const result = await this.getAliyunOssClient().get(this.ossKey(storagePath));
      return Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);
    }

    if (!this.isBlobUrl(storagePath)) return readFile(storagePath);

    const blob = await get(storagePath, { access: "private", useCache: false });
    if (!blob?.stream) {
      throw new ServiceUnavailableException("原始资料暂时无法读取，请稍后重试");
    }
    return this.streamToBuffer(blob.stream);
  }

  async delete(storagePath: string): Promise<void> {
    if (this.isOssPath(storagePath)) {
      await this.getAliyunOssClient().delete(this.ossKey(storagePath)).catch(() => undefined);
      return;
    }

    if (!this.isBlobUrl(storagePath)) {
      await unlink(storagePath).catch(() => undefined);
      return;
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) return;
    await del(storagePath).catch(() => undefined);
  }

  private isBlobUrl(storagePath: string): boolean {
    return /^https:\/\/[^/]+\/.+/.test(storagePath);
  }

  private isOssPath(storagePath: string): boolean {
    return storagePath.startsWith("oss://");
  }

  private ossPath(key: string): string {
    return `oss://${process.env.ALIYUN_OSS_BUCKET}/${key}`;
  }

  private ossKey(storagePath: string): string {
    return storagePath.replace(/^oss:\/\/[^/]+\//, "");
  }

  private hasAliyunOssConfig(): boolean {
    return Boolean(
      process.env.ALIYUN_OSS_REGION &&
        process.env.ALIYUN_OSS_BUCKET &&
        process.env.ALIYUN_ACCESS_KEY_ID &&
        process.env.ALIYUN_ACCESS_KEY_SECRET,
    );
  }

  private getAliyunOssClient(): AliOssClient {
    if (!this.hasAliyunOssConfig()) {
      throw new ServiceUnavailableException("阿里云 OSS 未配置，暂时无法读取原始资料");
    }
    this.ossClient ??= new AliOss({
      region: process.env.ALIYUN_OSS_REGION!,
      bucket: process.env.ALIYUN_OSS_BUCKET!,
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID!,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET!,
      secure: process.env.ALIYUN_OSS_SECURE !== "false",
      internal: process.env.ALIYUN_OSS_INTERNAL === "true",
    });
    return this.ossClient;
  }

  private async streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks, totalLength);
  }

  private async storeLocal(memberId: string, localPath: string, originalName: string): Promise<string> {
    const directory = join(process.env.LOCAL_RECORD_STORAGE_DIR || join(process.cwd(), "storage", "medical-records"), memberId);
    await mkdir(directory, { recursive: true });
    const destination = join(directory, basename(this.pathname(memberId, originalName)));
    await copyFile(localPath, destination);
    return destination;
  }

  private pathname(memberId: string, originalName: string): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const extension = extname(originalName).slice(0, 16);
    const safeBase = basename(originalName, extension)
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "medical-record";
    return `medical-records/${memberId}/${year}/${randomUUID()}-${safeBase}${extension}`;
  }
}
