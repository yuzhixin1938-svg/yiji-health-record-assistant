import test from "node:test";
import assert from "node:assert/strict";
import { canExtractCandidateFields, evaluateBaiduOcrReliability, getBaiduOcrEndpoints, guessRecordType, guessTitle, isReliableExtractedText, normalizeOcrCandidateText, normalizeRecordType, RecognitionService } from "../src/records/recognition.service.js";

test("OCR text without medical signals is treated as unreliable when short", () => {
  assert.equal(isReliableExtractedText("风景很好天气晴朗路边有很多文字", "image"), false);
});

test("OCR text with medical signals is treated as useful", () => {
  assert.equal(isReliableExtractedText("上海市口腔医院 门诊病历 牙齿检查 日期2026年7月10日", "image"), true);
});

test("machine file names are replaced by readable medical titles", () => {
  assert.equal(guessTitle("d813c739c6d897f9f6d7b0be0f4e", "OTHER", "口腔医院 牙齿 门诊病历", null), "牙科病历资料");
});

test("dental records are not classified as imaging without explicit imaging evidence", () => {
  assert.equal(normalizeRecordType("影像资料", "口腔医院 牙齿 门诊病历 复诊记录"), "门诊记录");
  assert.equal(guessRecordType("口腔医院 牙齿 门诊病历 复诊记录"), "门诊记录");
});

test("dental treatment plans are classified as visit records", () => {
  assert.equal(guessRecordType("诊疗计划 试行根管再治疗 冠修复 根管治疗复诊次数需2-3次"), "门诊记录");
});

test("visit records are classified before generic check words", () => {
  assert.equal(guessRecordType("上海市口腔医院 就诊记录 主诉 常规口腔检查 诊断 牙科检查"), "门诊记录");
});

test("real imaging evidence can still be classified as imaging", () => {
  assert.equal(guessRecordType("放射科 CT 影像诊断报告 片号123"), "检查报告");
  assert.equal(normalizeRecordType("影像资料", "放射科 CT 影像诊断报告 片号123"), "影像资料");
});

test("Baidu OCR without confidence is not trusted for noisy long text", () => {
  const noisyText = "亚f熊 割性涩 里曲典纽 喜多可以当斗印 门强轻量骨可 中鸡 立中啦 品如料终 图提732 专花T144S ".repeat(6);
  assert.deepEqual(evaluateBaiduOcrReliability(noisyText, null), { reliable: false, confidence: 0.08 });
});

test("Baidu OCR without confidence is still treated as unverified candidate text", () => {
  const structuredText = "上海市某医院 门诊就诊记录 科室 口腔科 主诉 牙齿不适 现病史 已持续数日 检查 口腔检查 诊断 待医生确认 治疗 记录处理过程 医嘱 按医嘱复诊".repeat(3);
  const result = evaluateBaiduOcrReliability(structuredText, null);
  assert.deepEqual(result, { reliable: false, confidence: 0.08 });
});

test("OCR candidate text normalizes only high-certainty hospital form labels", () => {
  const text = normalizeOcrCandidateText("上海心通人学迭学院附属第九入代医院 就诊H期 藏诊科童金雠神超料门诊 口腔种楂科 王诉 瑰病史 际社史 体格拾查");
  assert.equal(text.includes("上海交通大学医学院附属第九人民医院"), true);
  assert.equal(text.includes("就诊日期"), true);
  assert.equal(text.includes("就诊科室"), true);
  assert.equal(text.includes("口腔种植科"), true);
  assert.equal(text.includes("主诉 现病史 既往史 体格检查"), true);
});

test("Baidu OCR endpoints include accurate OCR fallback after configured primary endpoint", () => {
  assert.deepEqual(getBaiduOcrEndpoints("https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic"), [
    "https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic",
    "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic",
  ]);
});

test("Baidu OCR endpoints do not duplicate accurate OCR when it is already primary", () => {
  assert.deepEqual(getBaiduOcrEndpoints("https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"), ["https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"]);
});

test("candidate OCR text can fill review fields without marking recognition reliable", async () => {
  class TestRecognitionService extends RecognitionService {
    override async recognize(input: Parameters<RecognitionService["recognize"]>[0]) {
      return await super.recognize(input);
    }

    protectedTestResult = {
      engine: "baidu-accurate-ocr-v1",
      sourceType: "ocr_text" as const,
      text: "上海交通大学医学院附属第九人民医院 就诊日期:2026-07-10 就诊科室:口腔种植科 主诉 牙齿不适 现病史 需要复诊",
      message: "识别结果不够清楚，请按原档手动填写资料信息。",
      reliable: false,
      confidence: 0.08,
    };
  }

  const service = new TestRecognitionService() as RecognitionService & { extractText: () => Promise<unknown> };
  service.extractText = async () => (service as unknown as TestRecognitionService).protectedTestResult;
  const result = await service.recognize({ path: "x.jpg", originalName: "x.jpg", mimeType: "image/jpeg" });
  assert.equal(result.reliable, false);
  assert.equal(result.recordType, "门诊记录");
  assert.equal(result.visitDate, "2026-07-10");
  assert.equal(result.institution, "上海交通大学医学院附属第九人民医院");
  assert.equal(result.healthConcern, "牙齿");
  assert.equal(result.fields.find((field) => field.fieldName === "visitDate")?.sourceType, "ocr_text");
});

test("candidate field extraction requires useful medical text", () => {
  assert.equal(canExtractCandidateFields("风景很好天气晴朗路边有很多文字", "ocr_text"), false);
  assert.equal(canExtractCandidateFields("上海交通大学医学院附属第九人民医院 就诊日期:2026-07-10 就诊科室:口腔科 主诉 牙齿不适", "ocr_text"), true);
});
