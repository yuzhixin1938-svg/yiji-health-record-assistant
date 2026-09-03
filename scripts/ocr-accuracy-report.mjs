import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const inputPath = resolve(process.argv[2] ?? "docs/ocr-accuracy-template.csv");
const rows = parseCsv(readFileSync(inputPath, "utf8")).filter((row) => row.file_id || row.file_name);

if (!rows.length) {
  console.log("没有可统计的数据。请先在 CSV 中填写 30-50 份真实资料的测试结果。");
  process.exit(0);
}

const fieldResultColumns = [
  "title_result",
  "record_type_result",
  "visit_date_result",
  "institution_result",
  "department_result",
  "category_result",
];

const total = rows.length;
const uploadSuccess = rate(rows.filter((row) => yes(row.upload_saved)).length, total);
const readable = rate(rows.filter((row) => yes(row.ocr_readable)).length, total);
const flowSuccess = rate(rows.filter((row) => yes(row.flow_completed)).length, total);

let fieldTotal = 0;
let exact = 0;
let usable = 0;
for (const row of rows) {
  for (const column of fieldResultColumns) {
    const value = normalize(row[column]);
    if (!value) continue;
    fieldTotal += 1;
    if (value === "correct") exact += 1;
    if (value === "correct" || value === "partial") usable += 1;
  }
}

const correctionRows = rows.filter((row) => Number(row.manual_corrections_count || 0) > 0).length;

console.log("医记 OCR 第一轮准确率测试报告");
console.log("");
console.log(`样本数量：${total}`);
console.log(`上传成功率：${uploadSuccess}`);
console.log(`OCR 可读率：${readable}`);
console.log(`字段完全准确率：${rate(exact, fieldTotal)}`);
console.log(`字段可用率：${rate(usable, fieldTotal)}`);
console.log(`人工修改率：${rate(correctionRows, total)}`);
console.log(`完整流程成功率：${flowSuccess}`);
console.log("");
console.log("按资料类型统计：");
for (const [type, group] of groupBy(rows, (row) => row.record_type || "未填写类型")) {
  console.log(`- ${type}：${group.length} 份，OCR 可读率 ${rate(group.filter((row) => yes(row.ocr_readable)).length, group.length)}，流程成功率 ${rate(group.filter((row) => yes(row.flow_completed)).length, group.length)}`);
}
console.log("");
console.log("结论建议：");
console.log(decision({ total, uploadSuccess, readable, exactRate: rateNumber(exact, fieldTotal), usableRate: rateNumber(usable, fieldTotal), flowSuccess: rateNumber(rows.filter((row) => yes(row.flow_completed)).length, total) }));

function decision(metrics) {
  if (metrics.total < 30) return "样本少于 30 份，先不要判断 OCR 方案优劣。";
  if (percentNumber(metrics.uploadSuccess) < 95) return "先修上传和原件保存链路，不要急着升级 OCR。";
  if (percentNumber(metrics.readable) < 70) return "图片可读率偏低，优先评估高精度 OCR、医疗 OCR 或拍照质量引导。";
  if (metrics.exactRate < 0.6 && metrics.usableRate >= 0.8) return "文字可用但字段提取不稳，优先优化字段规则。";
  if (metrics.usableRate < 0.8) return "字段可用率偏低，需要升级 OCR 或增加人工核对引导。";
  if (metrics.flowSuccess < 0.9) return "识别后流程仍有阻塞，优先修核对、保存、时间线和资料包流程。";
  return "第一轮达到 MVP 可用标准，可以继续扩大样本测试。";
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length || !lines[0]) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function yes(value) {
  return ["yes", "y", "true", "1", "是"].includes(normalize(value));
}

function rate(count, denominator) {
  return `${(rateNumber(count, denominator) * 100).toFixed(1)}%`;
}

function rateNumber(count, denominator) {
  return denominator ? count / denominator : 0;
}

function percentNumber(value) {
  if (typeof value === "string") return Number(value.replace("%", ""));
  return value * 100;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}
