import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const folder = process.argv[2] || "C:\\Users\\86139\\Downloads\\病历";
const token = process.env.YIJI_AUTH_TOKEN || process.argv[3] || "";
const apiBase = process.env.YIJI_API_BASE || "https://yijijiankang.cn/v1";
const outDir = process.argv[4] || "docs";
const supported = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

function mimeType(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function useful(result: any): boolean {
  const r = result?.recognition || {};
  const type = r.recordType;
  return r.reliable === true && type && type !== "未识别" && type !== "OTHER";
}

async function upload(file: string) {
  const path = join(folder, file);
  const body = new FormData();
  const bytes = await readFile(path);
  body.append("file", new Blob([bytes], { type: mimeType(file) }), file);
  body.append("recognitionMode", "standard");
  const response = await fetch(`${apiBase}/records/recognition/test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }
  if (!response.ok) throw new Error(parsed?.error?.message || parsed?.message || `HTTP ${response.status}`);
  return parsed;
}

async function main() {
  if (!token) throw new Error("缺少 YIJI_AUTH_TOKEN。请提供一次登录 token 后再运行。");
  const files = (await readdir(folder)).filter((file) => supported.has(extname(file).toLowerCase()));
  const rows: any[] = [];
  for (const file of files) {
    process.stdout.write(`UPLOAD ${file} ... `);
    try {
      const result = await upload(file);
      const r = result.recognition || {};
      const row = {
        file,
        engine: r.engine || "",
        reliable: r.reliable === true,
        confidence: r.confidence || 0,
        usable: useful(result),
        title: r.title || "",
        recordType: r.recordType || "",
        visitDate: r.visitDate || "",
        institution: r.institution || "",
        healthConcern: r.healthConcern || "",
        rawLength: String(r.rawText || "").length,
        message: r.message || "",
        rawPreview: String(r.rawText || "").replace(/\s+/g, " ").slice(0, 180),
      };
      rows.push(row);
      process.stdout.write(`${row.usable ? "可用" : "不可用"} ${row.engine} ${Math.round(row.confidence * 100)}%\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ file, engine: "error", reliable: false, confidence: 0, usable: false, title: "", recordType: "", visitDate: "", institution: "", healthConcern: "", rawLength: 0, message, rawPreview: "" });
      process.stdout.write(`失败 ${message}\n`);
    }
  }
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const json = join(outDir, `ocr-online-batch-${stamp}.json`);
  const csv = join(outDir, `ocr-online-batch-${stamp}.csv`);
  const md = join(outDir, `ocr-online-batch-${stamp}.md`);
  const usableRate = Math.round((rows.filter((r) => r.usable).length / Math.max(rows.length, 1)) * 100);
  const reliableRate = Math.round((rows.filter((r) => r.reliable).length / Math.max(rows.length, 1)) * 100);
  await writeFile(json, JSON.stringify({ apiBase, folder, createdAt: new Date().toISOString(), usableRate, reliableRate, rows }, null, 2), "utf8");
  await writeFile(csv, ["file,engine,reliable,confidence,usable,title,recordType,visitDate,institution,healthConcern,rawLength,message,rawPreview", ...rows.map((r) => Object.values(r).map(csvCell).join(","))].join("\n"), "utf8");
  await writeFile(md, [`# 线上 OCR 批量测试`, ``, `- 文件数：${rows.length}`, `- 可读率：${reliableRate}%`, `- 可用率：${usableRate}%`, ``, `| 文件 | 引擎 | 可信度 | 可用 | 类型 | 标题 | 原因 |`, `|---|---:|---:|---:|---|---|---|`, ...rows.map((r) => `| ${r.file} | ${r.engine} | ${Math.round(r.confidence * 100)}% | ${r.usable ? "是" : "否"} | ${r.recordType || "未识别"} | ${r.title} | ${String(r.message).replace(/\|/g, " ")} |`)].join("\n"), "utf8");
  console.log(`USABLE_RATE=${usableRate}%`);
  console.log(`REPORT_JSON=${json}`);
  console.log(`REPORT_CSV=${csv}`);
  console.log(`REPORT_MD=${md}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
