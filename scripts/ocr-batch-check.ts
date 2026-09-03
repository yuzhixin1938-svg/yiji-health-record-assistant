import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { config } from "dotenv";
import { RecognitionService, guessRecordType, isReliableExtractedText } from "../apps/api/src/records/recognition.service.js";

config({ path: ".env.production.local" });
config({ path: ".env.local" });
config();

const inputDir = process.argv[2] || "C:\\Users\\86139\\Downloads\\病历";
const outputDir = process.argv[3] || "docs";
const supported = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

type Row = {
  file: string;
  engine: string;
  reliable: boolean;
  confidence: number;
  textExtracted: boolean;
  candidateNeedsReview: boolean;
  title: string;
  recordType: string;
  visitDate: string | null;
  institution: string | null;
  healthConcern: string | null;
  rawLength: number;
  fieldFillRate: number;
  issue: string;
  rawPreview: string;
};

function mimeType(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function issueOf(row: Omit<Row, "issue">): string {
  if (!row.reliable) return row.rawLength >= 80 ? "已提取候选文字，但需人工核对" : "图片文字太少或识别失败";
  if (!row.recordType || row.recordType === "未识别" || row.recordType === "OTHER") {
    const guessed = guessRecordType(row.rawPreview);
    return guessed && guessed !== "OTHER" ? `字段抽取失败，规则可推为 ${guessed}` : "文字可读，但缺少资料类型关键词";
  }
  if (row.fieldFillRate < 0.6) return "关键字段填充不足";
  return "可用";
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function markdown(rows: Row[]): string {
  const usable = rows.filter((r) => r.issue === "可用").length;
  const reliable = rows.filter((r) => r.reliable).length;
  const textExtracted = rows.filter((r) => r.textExtracted).length;
  const needsReview = rows.filter((r) => r.candidateNeedsReview).length;
  const avgFill = rows.reduce((sum, r) => sum + r.fieldFillRate, 0) / Math.max(rows.length, 1);
  return [
    "# OCR 批量测试报告",
    "",
    `- 文件数：${rows.length}`,
    `- 文字提取成功率：${Math.round((textExtracted / Math.max(rows.length, 1)) * 100)}%`,
    `- 字段自动填充率：${Math.round(avgFill * 100)}%`,
    `- 字段需核对率：${Math.round((needsReview / Math.max(rows.length, 1)) * 100)}%`,
    `- 可直接归档率：${Math.round((usable / Math.max(rows.length, 1)) * 100)}%`,
    `- 高可信可读率：${Math.round((reliable / Math.max(rows.length, 1)) * 100)}%`,
    "",
    "| 文件 | 引擎 | 文字提取 | 需核对 | 可信度 | 类型 | 标题 | 字段填充 | 问题 |",
    "|---|---:|---:|---:|---:|---|---|---:|---|",
    ...rows.map((r) => `| ${r.file} | ${r.engine} | ${r.textExtracted ? "是" : "否"} | ${r.candidateNeedsReview ? "是" : "否"} | ${Math.round(r.confidence * 100)}% | ${r.recordType || "未识别"} | ${r.title} | ${Math.round(r.fieldFillRate * 100)}% | ${r.issue} |`),
    "",
  ].join("\n");
}

async function main() {
  const service = new RecognitionService();
  const files = (await readdir(inputDir)).filter((file) => supported.has(extname(file).toLowerCase()));
  const rows: Row[] = [];

  for (const file of files) {
    const path = join(inputDir, file);
    process.stdout.write(`OCR ${file} ... `);
    try {
      const result = await service.recognize({ path, originalName: file, mimeType: mimeType(file), recognitionMode: "standard" });
      const fields = [result.recordType, result.visitDate, result.institution, result.healthConcern].filter(Boolean);
      const rawPreview = result.rawText.replace(/\s+/g, " ").slice(0, 220);
      const textExtracted = rawPreview.length >= 80 && !rawPreview.includes("识别结果不够清楚");
      const base = {
        file,
        engine: result.engine,
        reliable: result.reliable && isReliableExtractedText(result.rawText, mimeType(file) === "application/pdf" ? "pdf" : "image"),
        confidence: result.confidence,
        textExtracted,
        candidateNeedsReview: !result.reliable && textExtracted,
        title: result.title,
        recordType: result.recordType,
        visitDate: result.visitDate,
        institution: result.institution,
        healthConcern: result.healthConcern,
        rawLength: result.rawText.length,
        fieldFillRate: fields.length / 4,
        rawPreview,
      };
      const row = { ...base, issue: issueOf(base) };
      rows.push(row);
      process.stdout.write(`${row.issue}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({
        file,
        engine: "error",
        reliable: false,
        confidence: 0,
        textExtracted: false,
        candidateNeedsReview: false,
        title: "",
        recordType: "",
        visitDate: null,
        institution: null,
        healthConcern: null,
        rawLength: 0,
        fieldFillRate: 0,
        issue: `识别报错：${message}`,
        rawPreview: "",
      });
      process.stdout.write(`失败：${message}\n`);
    }
  }

  await mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(outputDir, `ocr-batch-report-${stamp}.json`);
  const csvPath = join(outputDir, `ocr-batch-report-${stamp}.csv`);
  const mdPath = join(outputDir, `ocr-batch-report-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify({ inputDir, createdAt: new Date().toISOString(), rows }, null, 2), "utf8");
  await writeFile(csvPath, [
    "file,engine,reliable,confidence,textExtracted,candidateNeedsReview,title,recordType,visitDate,institution,healthConcern,rawLength,fieldFillRate,issue,rawPreview",
    ...rows.map((r) => [r.file, r.engine, r.reliable, r.confidence, r.textExtracted, r.candidateNeedsReview, r.title, r.recordType, r.visitDate, r.institution, r.healthConcern, r.rawLength, r.fieldFillRate, r.issue, r.rawPreview].map(csvCell).join(",")),
  ].join("\n"), "utf8");
  await writeFile(mdPath, markdown(rows), "utf8");
  console.log(`REPORT_JSON=${jsonPath}`);
  console.log(`REPORT_CSV=${csvPath}`);
  console.log(`REPORT_MD=${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
