import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import net from "node:net";
import tls from "node:tls";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
let baiduAccessTokenCache: { token: string; expiresAt: number } | null = null;
const BAIDU_ACCURATE_OCR_ENDPOINT = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic";

export type RecognizedFieldInput = {
  fieldName: string;
  fieldValue: string | null;
  sourceType: "ocr_text" | "vision_text" | "pdf_text" | "user_input" | "filename" | "unrecognized";
  sourceText: string | null;
  confidence: number;
};

export type RecognitionResult = {
  engine: string;
  title: string;
  recordType: string;
  visitDate: string | null;
  institution: string | null;
  healthConcern: string | null;
  rawText: string;
  reliable: boolean;
  confidence: number;
  message: string;
  fields: RecognizedFieldInput[];
};

type StructuredRecognition = {
  title: string | null;
  recordType: string | null;
  visitDate: string | null;
  institution: string | null;
  healthConcern: string | null;
  rawText: string;
  confidence: number;
  canReliablyRead: boolean;
  warning: string | null;
};

type TextExtractionResult = {
  engine: string;
  sourceType: "ocr_text" | "vision_text" | "pdf_text";
  text: string;
  message: string;
  reliable: boolean;
  confidence: number;
  structured?: StructuredRecognition;
};

type RecognitionMode = "standard" | "deep";

@Injectable()
export class RecognitionService {
  async recognize(input: {
    path: string;
    originalName: string;
    mimeType: string;
    title?: string;
    recordType?: string;
    visitDate?: string;
    institution?: string;
    healthConcern?: string;
    recognitionMode?: RecognitionMode;
    skipVisionFileQuota?: boolean;
  }): Promise<RecognitionResult> {
    const textResult = await this.extractText(input.path, input.mimeType, input.recognitionMode ?? "standard", input.skipVisionFileQuota ?? false);
    const rawText = textResult.text.trim();
    const sourceType = textResult.sourceType;
    const reliable = textResult.reliable && Boolean(rawText);
    const canUseCandidateFields = reliable || canExtractCandidateFields(rawText, sourceType);
    const sourceText = canUseCandidateFields ? rawText.slice(0, 240) : textResult.message;
    const searchableText = `${stripExtension(input.originalName)}\n${rawText}`;

    const structured = textResult.structured;
    const candidateRecordType = input.recordType ?? (canUseCandidateFields ? structured?.recordType ?? guessRecordType(searchableText) : "未识别");
    const recordType = normalizeRecordType(candidateRecordType, searchableText);
    const visitDate = input.visitDate ?? (canUseCandidateFields ? structured?.visitDate ?? guessDate(searchableText) : null);
    const institution = input.institution ?? (canUseCandidateFields ? structured?.institution ?? guessInstitution(searchableText) : null);
    const healthConcern = input.healthConcern ?? (canUseCandidateFields ? structured?.healthConcern ?? guessHealthConcern(searchableText) : null);
    const title = input.title ?? guessTitle(stripExtension(input.originalName), recordType, searchableText, healthConcern);
    const baseConfidence = reliable ? textResult.confidence : canUseCandidateFields ? Math.max(textResult.confidence, 0.3) : 0.05;
    const recognitionSource = canUseCandidateFields ? sourceType : "unrecognized";

    const fields: RecognizedFieldInput[] = [
      field("title", title, input.title ? "user_input" : "filename", input.title ?? stripExtension(input.originalName), input.title ? 0.98 : 0.9),
      field("recordType", recordType, input.recordType ? "user_input" : recognitionSource, input.recordType ?? sourceText, input.recordType ? 0.98 : baseConfidence),
      field("visitDate", visitDate, input.visitDate ? "user_input" : recognitionSource, input.visitDate ?? sourceText, input.visitDate ? 0.98 : baseConfidence),
      field("institution", institution, input.institution ? "user_input" : recognitionSource, input.institution ?? sourceText, input.institution ? 0.98 : baseConfidence),
      field("healthConcern", healthConcern, input.healthConcern ? "user_input" : recognitionSource, input.healthConcern ?? sourceText, input.healthConcern ? 0.98 : baseConfidence),
    ];

    return {
      engine: textResult.engine,
      title,
      recordType,
      visitDate,
      institution,
      healthConcern,
      rawText: rawText || textResult.message,
      reliable,
      confidence: textResult.confidence,
      message: textResult.message,
      fields,
    };
  }

  private async extractText(path: string, mimeType: string, mode: RecognitionMode, skipVisionFileQuota: boolean): Promise<TextExtractionResult> {
    if (mimeType === "application/pdf" || extname(path).toLowerCase() === ".pdf") {
      let parser: { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } | null = null;
      try {
        const { PDFParse } = await import("pdf-parse");
        parser = new PDFParse({ data: await readFile(path) });
        const parsed = await parser.getText();
        const reliable = isReliableExtractedText(parsed.text, "pdf");
        return {
          engine: "pdf-parse-v1",
          sourceType: "pdf_text",
          text: parsed.text,
          message: reliable ? "PDF 内容已读取，请核对后保存。" : "PDF 里可读取的文字较少，请按原件补充信息。",
          reliable,
          confidence: reliable ? 0.78 : 0.08,
        };
      } catch (error) {
        return { engine: "pdf-parse-v1", sourceType: "pdf_text", text: "", message: `PDF 文本提取失败：${errorMessage(error)}`, reliable: false, confidence: 0.05 };
      } finally {
        await parser?.destroy();
      }
    }

    if (mimeType.startsWith("image/")) {
      const cheapResult = await recognizeImageWithCheapOcr(path, mimeType);
      if (cheapResult.reliable) return cheapResult;

      const visionResult = await recognizeImageWithVisionModel(path, mimeType, skipVisionFileQuota);
      if (visionResult) {
        const visionText = visionResult.rawText.trim();
        if (!visionText) return cheapResult;

        const fallbackText = visionText || cheapResult.text;
        const fallbackMessage =
          visionResult.canReliablyRead || visionText
            ? visionResult.warning ?? "深度视觉识别完成，请核对字段。"
            : `${visionResult.warning ?? "深度识别仍不确定，请手动填写字段。"}；已保留普通识别结果供核对。`;
        return {
          engine: "openai-vision-v1",
          sourceType: "vision_text",
          text: fallbackText,
          message: visionResult.canReliablyRead ? "已识别出资料内容，请核对后保存。" : fallbackMessage,
          reliable: visionResult.canReliablyRead && isReliableExtractedText(visionResult.rawText, "image"),
          confidence: clampConfidence(visionResult.confidence),
          structured: visionResult,
        };
      }

      return cheapResult;
    }

    return {
      engine: "no-supported-extractor-v1",
      sourceType: "ocr_text",
      text: "",
      message: "当前文件类型暂未接入真实文本提取，请上传可复制文本 PDF 或图片。",
      reliable: false,
      confidence: 0.05,
    };
  }
}

export function canExtractCandidateFields(text: string, sourceType: TextExtractionResult["sourceType"]): boolean {
  if (!text.trim()) return false;
  return isReliableExtractedText(text, sourceType === "pdf_text" ? "pdf" : "image");
}

async function recognizeImageWithCheapOcr(path: string, mimeType: string): Promise<TextExtractionResult> {
  const baiduResult = await recognizeImageWithBaiduMedicalOcr(path);
  if (baiduResult) return baiduResult;

  const cloudResult = await recognizeImageWithCloudOcr(path, mimeType);
  if (cloudResult) return cloudResult;

  try {
    const { stdout } = await execFileAsync("tesseract", [path, "stdout", "-l", "chi_sim+eng"], { timeout: 30_000 });
    const reliable = isReliableExtractedText(stdout, "image");
    return {
      engine: "tesseract-cli-v1",
      sourceType: "ocr_text",
      text: stdout,
      message: reliable ? "已识别出部分内容，请按原件核对。" : "图片里的文字不够清楚，请按原件补充信息。",
      reliable: false,
      confidence: reliable ? 0.22 : 0.05,
    };
  } catch (cliError) {
    try {
      const text = await recognizeImageWithTesseractJs(path);
      const reliable = isReliableExtractedText(text, "image");
      return {
        engine: "tesseract-js-v1",
        sourceType: "ocr_text",
        text,
        message: reliable ? "已识别出部分内容，请按原件核对。" : "图片里的文字不够清楚，请按原件补充信息。",
        reliable: false,
        confidence: reliable ? 0.2 : 0.05,
      };
    } catch (jsError) {
      const cliMessage = errorMessage(cliError);
      const jsMessage = errorMessage(jsError);
      return {
        engine: "tesseract-js-v1",
        sourceType: "ocr_text",
        text: "",
        message: `普通 OCR 未完成：${jsMessage || cliMessage}`,
        reliable: false,
        confidence: 0.05,
      };
    }
  }
}

async function recognizeImageWithBaiduMedicalOcr(path: string): Promise<TextExtractionResult | null> {
  const apiKey = process.env.BAIDU_OCR_API_KEY;
  const secretKey = process.env.BAIDU_OCR_SECRET_KEY;
  const endpoints = getBaiduOcrEndpoints(process.env.BAIDU_OCR_MEDICAL_ENDPOINT, process.env.BAIDU_OCR_HIGH_PRECISION_ENDPOINT);
  if (!apiKey || !secretKey || !endpoints.length) return null;

  try {
    const token = await getBaiduAccessToken(apiKey, secretKey);
    const sourceImage = await readFile(path);
    const candidates: TextExtractionResult[] = [];
    for (const endpoint of endpoints) {
      for (const rotation of [0, 90, 270, 180]) {
        const result = await callBaiduOcr(endpoint, token, sourceImage, rotation);
        if (!result) continue;
        if (result.reliable) return result;
        candidates.push(result);
      }
    }
    return candidates.sort((a, b) => scoreOcrText(b.text, b.confidence) - scoreOcrText(a.text, a.confidence))[0] ?? null;
  } catch {
    return null;
  }
}

export function getBaiduOcrEndpoints(primaryEndpoint?: string, highPrecisionEndpoint?: string): string[] {
  const primary = primaryEndpoint?.trim();
  const highPrecision = highPrecisionEndpoint?.trim() || BAIDU_ACCURATE_OCR_ENDPOINT;
  return Array.from(new Set([primary || highPrecision, highPrecision].filter(Boolean)));
}

async function callBaiduOcr(endpoint: string, token: string, sourceImage: Buffer, rotation: number): Promise<TextExtractionResult | null> {
  const image = await prepareImageForOcr(sourceImage, rotation);
  const response = await fetch(withAccessToken(endpoint, token), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image: image.toString("base64") }),
  });
  if (!response.ok) return null;

  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.error_code === "number" || typeof body.error_msg === "string") return null;

  const text = normalizeOcrCandidateText(flattenBaiduOcrText(body));
  const confidence = readBaiduConfidence(body);
  const reliability = evaluateBaiduOcrReliability(text, confidence);

  return {
    engine: getBaiduOcrEngineName(endpoint),
    sourceType: "ocr_text",
    text,
    message: reliability.reliable ? "已识别出资料内容，请核对后保存。" : "已识别出部分内容，请核对后保存。",
    reliable: reliability.reliable,
    confidence: reliability.confidence,
  };
}

export function evaluateBaiduOcrReliability(text: string, confidence: number | null): { reliable: boolean; confidence: number } {
  const normalizedConfidence = confidence === null ? null : clampConfidence(confidence);
  if (normalizedConfidence === null) return { reliable: false, confidence: 0.08 };

  const minConfidence = Number(process.env.BAIDU_OCR_MIN_CONFIDENCE ?? 0.55);
  const reliableByConfidence = isReliableExtractedText(text, "image") && normalizedConfidence >= minConfidence;
  const reliableByContent = hasStrongMedicalStructure(text);
  const reliable = reliableByConfidence || reliableByContent;
  if (!reliable) return { reliable: false, confidence: 0.08 };
  if (reliableByContent) return { reliable: true, confidence: Math.max(normalizedConfidence, 0.62) };
  return { reliable: true, confidence: normalizedConfidence };
}

function getBaiduOcrEngineName(endpoint: string): string {
  if (endpoint.includes("/accurate_basic")) return "baidu-accurate-ocr-v1";
  if (endpoint.includes("/general_basic")) return "baidu-basic-ocr-v1";
  return "baidu-ocr-v1";
}

function scoreOcrText(text: string, confidence: number): number {
  const usefulChars = (text.match(/[\u4e00-\u9fa5A-Za-z0-9]/g) ?? []).length;
  const medicalBonus = hasMedicalSignal(text) ? 80 : 0;
  return usefulChars + medicalBonus + confidence * 100;
}

async function getBaiduAccessToken(apiKey: string, secretKey: string): Promise<string> {
  const now = Date.now();
  if (baiduAccessTokenCache && baiduAccessTokenCache.expiresAt > now + 60_000) return baiduAccessTokenCache.token;

  const url = new URL("https://aip.baidubce.com/oauth/2.0/token");
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("client_secret", secretKey);

  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error("百度 OCR 授权失败");
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("百度 OCR 未返回 access_token");

  baiduAccessTokenCache = {
    token: body.access_token,
    expiresAt: now + Math.max(60, body.expires_in ?? 2_592_000) * 1000,
  };
  return body.access_token;
}

function withAccessToken(endpoint: string, token: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("access_token", token);
  return url.toString();
}

function flattenBaiduOcrText(value: unknown): string {
  const parts: string[] = [];
  collectBaiduText(value, parts);
  return Array.from(new Set(parts.map((item) => item.trim()).filter(Boolean))).join("\n");
}

export function normalizeOcrCandidateText(text: string): string {
  return text
    .replace(/[上士]海[李心]通[穷人]学.{0,2}学院附属第九[入人大](?:民|代|太民|大民)?[松医]?院/g, "上海交通大学医学院附属第九人民医院")
    .replace(/上海[心文]通人学.{0,2}学院附属第九[入人大](?:民|代|太民)?医院/g, "上海交通大学医学院附属第九人民医院")
    .replace(/[上士]?海[心文]通大字医字院丽属第九人民医院/g, "上海交通大学医学院附属第九人民医院")
    .replace(/上海市口腔医院儿童门腔科/g, "上海市口腔医院儿童口腔科")
    .replace(/上海市门腔医院/g, "上海市口腔医院")
    .replace(/口腔种[楂植]科/g, "口腔种植科")
    .replace(/日腔/g, "口腔")
    .replace(/就诊日粉/g, "就诊日期")
    .replace(/(?:藏[诊多]|就诊)H期/g, "就诊日期")
    .replace(/(?:就诊|藏诊)科[童室雪鲁命金雠神超料]+/g, "就诊科室")
    .replace(/日院正[响畸]/g, "口腔正畸")
    .replace(/王诉/g, "主诉")
    .replace(/瑰病史/g, "现病史")
    .replace(/寥接史/g, "接诊史")
    .replace(/际社史/g, "既往史")
    .replace(/体格拾查/g, "体格检查")
    .replace(/骑检查/g, "辅助检查")
    .replace(/影像学检合/g, "影像学检查");
}

function collectBaiduText(value: unknown, parts: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectBaiduText(item, parts));
    return;
  }
  const item = value as Record<string, unknown>;
  for (const key of ["words", "word", "text", "value", "result"]) {
    if (typeof item[key] === "string" && item[key].trim()) parts.push(item[key]);
  }
  for (const child of Object.values(item)) collectBaiduText(child, parts);
}

function readBaiduConfidence(value: unknown): number | null {
  const candidates: number[] = [];
  collectConfidence(value, candidates);
  if (!candidates.length) return null;
  const normalized = candidates.map((item) => (item > 1 ? item / 100 : item)).filter((item) => Number.isFinite(item));
  if (!normalized.length) return null;
  return normalized.reduce((sum, item) => sum + item, 0) / normalized.length;
}

function collectConfidence(value: unknown, candidates: number[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectConfidence(item, candidates));
    return;
  }
  const item = value as Record<string, unknown>;
  for (const key of ["probability", "confidence", "score"]) {
    if (typeof item[key] === "number") candidates.push(item[key]);
  }
  for (const child of Object.values(item)) collectConfidence(child, candidates);
}

async function recognizeImageWithCloudOcr(path: string, mimeType: string): Promise<TextExtractionResult | null> {
  const endpoint = process.env.CLOUD_OCR_ENDPOINT;
  if (!endpoint) return null;

  try {
    const image = await readFile(path);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CLOUD_OCR_API_KEY ? { Authorization: `Bearer ${process.env.CLOUD_OCR_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        mimeType,
        imageBase64: image.toString("base64"),
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { text?: string; confidence?: number; message?: string };
    const text = body.text ?? "";
    const reliable = isReliableExtractedText(text, "image") && (body.confidence ?? 0.6) >= 0.5;
    return {
      engine: "cloud-ocr-v1",
      sourceType: "ocr_text",
      text,
      message: reliable ? "已识别出资料内容，请核对后保存。" : body.message ?? "已识别出部分内容，请核对后保存。",
      reliable,
      confidence: reliable ? clampConfidence(body.confidence ?? 0.6) : 0.08,
    };
  } catch {
    return null;
  }
}

async function recognizeImageWithVisionModel(path: string, mimeType: string, skipFileQuota = false): Promise<StructuredRecognition | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const sourceImage = await readFile(path);
    const fileHash = createHash("sha256").update(sourceImage).digest("hex");
    const permission = await reserveOpenAiVisionCall(fileHash, skipFileQuota);
    if (permission.allowed === false) {
      return {
        title: null,
        recordType: null,
        visitDate: null,
        institution: null,
        healthConcern: null,
        rawText: "",
        confidence: 0.05,
        canReliablyRead: false,
        warning: permission.reason,
      };
    }

    const image = await prepareImageForVision(sourceImage, mimeType);
    const model = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "请识别这张图片中的医疗资料文字，并提取字段。只基于图片可见内容，不要猜测。若图片不是医疗资料、文字不清晰、或无法可靠读取，canReliablyRead 必须为 false，未知字段填 null。",
              },
              {
                type: "input_image",
                image_url: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "medical_record_ocr",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: ["string", "null"] },
                recordType: { type: ["string", "null"] },
                visitDate: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
                institution: { type: ["string", "null"] },
                healthConcern: { type: ["string", "null"] },
                rawText: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                canReliablyRead: { type: "boolean" },
                warning: { type: ["string", "null"] },
              },
              required: ["title", "recordType", "visitDate", "institution", "healthConcern", "rawText", "confidence", "canReliablyRead", "warning"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      return visionFailure(`深度识别接口返回 ${response.status}，请检查模型、额度或网络配置。`);
    }
    const body = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string; type?: string }> }> };
    const text = body.output_text ?? body.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
    if (!text) return visionFailure("深度识别没有返回可解析文字，请检查模型返回格式。");
    return normalizeStructuredRecognition(JSON.parse(text));
  } catch (error) {
    return visionFailure(`深度识别未完成：${errorMessage(error)}`);
  }
}

function visionFailure(warning: string): StructuredRecognition {
  return {
    title: null,
    recordType: null,
    visitDate: null,
    institution: null,
    healthConcern: null,
    rawText: "",
    confidence: 0.05,
    canReliablyRead: false,
    warning,
  };
}

async function prepareImageForVision(image: Buffer, mimeType: string): Promise<{ data: Buffer; mimeType: string }> {
  const maxBytes = Number(process.env.OPENAI_VISION_MAX_IMAGE_BYTES ?? 1_200_000);
  if (image.byteLength <= maxBytes) return { data: image, mimeType };

  try {
    const data = await sharp(image)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true })
      .toBuffer();
    return { data, mimeType: "image/jpeg" };
  } catch {
    return { data: image, mimeType: "image/jpeg" };
  }
}

async function prepareImageForOcr(image: Buffer, rotation = 0): Promise<Buffer> {
  try {
    const pipeline = sharp(image).rotate();
    if (rotation) pipeline.rotate(rotation);
    return await pipeline
      .resize({ width: 3200, height: 3200, fit: "inside", withoutEnlargement: false })
      .grayscale()
      .normalize()
      .linear(1.12, -8)
      .sharpen({ sigma: 1.1, m1: 1.2, m2: 2 })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch {
    return image;
  }
}

async function reserveOpenAiVisionCall(fileHash: string, skipFileQuota = false): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const dailyLimit = Number(process.env.OPENAI_VISION_DAILY_LIMIT ?? 20);
  if (dailyLimit <= 0) return { allowed: false, reason: "深度识别今日额度已关闭，请手动填写字段。" };

  const date = new Date().toISOString().slice(0, 10);
  const fileKey = `yiji:openai-vision:file:${fileHash}`;
  const dayKey = `yiji:openai-vision:day:${date}`;

  if (!skipFileQuota) {
    const firstFileUse = await redisCommand(["SET", fileKey, "1", "EX", String(60 * 60 * 24 * 30), "NX"]);
    if (firstFileUse !== "OK") return { allowed: false, reason: "这张图片已用过一次深度识别，为控制成本不再重复调用，请手动核对字段。" };
  }

  const used = Number(await redisCommand(["INCR", dayKey]));
  if (used === 1) await redisCommand(["EXPIRE", dayKey, String(60 * 60 * 36)]);
  if (used > dailyLimit) {
    if (!skipFileQuota) await redisCommand(["DEL", fileKey]);
    return { allowed: false, reason: "今日深度识别额度已用完，请使用普通识别或手动填写。" };
  }

  return { allowed: true };
}

async function redisCommand(args: string[]): Promise<string> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required for deep recognition quota control");

  const url = new URL(redisUrl);
  const password = url.password ? decodeURIComponent(url.password) : undefined;
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  const useTls = url.protocol === "rediss:";
  const socket = useTls
    ? tls.connect({ host: url.hostname, port, servername: url.hostname })
    : net.connect({ host: url.hostname, port });

  try {
    await onceConnected(socket);
    if (password) await sendRedisCommand(socket, ["AUTH", password]);
    return await sendRedisCommand(socket, args);
  } finally {
    socket.end();
  }
}

async function onceConnected(socket: net.Socket): Promise<void> {
  if (!socket.connecting) return;
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
}

async function sendRedisCommand(socket: net.Socket, args: string[]): Promise<string> {
  const command = `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join("")}`;
  socket.write(command);
  return await readRedisReply(socket);
}

async function readRedisReply(socket: net.Socket): Promise<string> {
  return await new Promise((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const parsed = parseRedisReply(buffer);
      if (parsed !== null) {
        cleanup();
        resolve(parsed);
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

function parseRedisReply(reply: string): string | null {
  if (!reply) return null;
  const lineEnd = reply.indexOf("\r\n");
  if (lineEnd < 0) return null;
  const firstLine = reply.slice(1, lineEnd);
  if (reply[0] === "+") return firstLine;
  if (reply[0] === ":") return firstLine;
  if (reply[0] === "$") {
    const length = Number(firstLine);
    if (length === -1) return "";
    const start = lineEnd + 2;
    if (reply.length < start + length + 2) return null;
    return reply.slice(start, start + length);
  }
  if (reply[0] === "-") throw new Error(firstLine);
  return null;
}

async function recognizeImageWithTesseractJs(path: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["chi_sim", "eng"]);

  try {
    const result = await withTimeout(worker.recognize(path), 45_000);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OCR 超时，请先手动填写字段，稍后可重新识别。")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function field(
  fieldName: string,
  fieldValue: string | null,
  sourceType: RecognizedFieldInput["sourceType"],
  sourceText: string | null,
  confidence: number,
): RecognizedFieldInput {
  return { fieldName, fieldValue, sourceType, sourceText, confidence };
}

function normalizeStructuredRecognition(value: unknown): StructuredRecognition | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const rawText = typeof item.rawText === "string" ? item.rawText.trim() : "";
  const confidence = typeof item.confidence === "number" ? item.confidence : 0;
  const canReliablyRead = item.canReliablyRead === true;
  return {
    title: nullableString(item.title),
    recordType: nullableString(item.recordType),
    visitDate: normalizeDate(nullableString(item.visitDate)),
    institution: nullableString(item.institution),
    healthConcern: nullableString(item.healthConcern),
    rawText,
    confidence,
    canReliablyRead,
    warning: nullableString(item.warning),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : guessDate(value);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.05;
  return Math.max(0.05, Math.min(0.98, value));
}

export function isReliableExtractedText(text: string, mode: "pdf" | "image"): boolean {
  const normalized = text.trim();
  if (normalized.length < (mode === "pdf" ? 12 : 20)) return false;

  const cjkCount = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinOrDigitCount = (normalized.match(/[a-zA-Z0-9]/g) ?? []).length;
  const usefulCount = cjkCount + latinOrDigitCount;
  if (usefulCount < (mode === "pdf" ? 8 : 12)) return false;

  const noisyCount = (normalized.match(/[|\\[\]{}<>~`^_=]{1}/g) ?? []).length;
  if (noisyCount / Math.max(usefulCount, 1) > 0.35) return false;

  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 8) {
    const veryShortLines = lines.filter((line) => line.replace(/\s/g, "").length <= 4).length;
    if (veryShortLines / lines.length > 0.55) return false;
  }

  if (mode === "image" && !hasMedicalSignal(normalized) && usefulCount < 80) return false;

  return true;
}

function hasMedicalSignal(text: string): boolean {
  return /(医院|门诊|急诊|病历|病史|处方|报告|检查|检验|诊断|科室|医生|医师|姓名|年龄|日期|体检|口腔|牙|胃|血压|血糖|CT|MRI|B超|超声)/i.test(text);
}

function hasStrongMedicalStructure(text: string): boolean {
  const usefulCount = (text.match(/[\u4e00-\u9fa5A-Za-z0-9]/g) ?? []).length;
  return usefulCount >= 120 && /(医院|门诊|就诊|就医|科室)/.test(text) && /(主诉|现病史|检查|诊断|治疗|处理|医嘱)/.test(text);
}

export function guessRecordType(text: string): string {
  if (text.includes("处方")) return "处方";
  if (text.includes("体检")) return "体检报告";
  if (text.includes("门诊") || text.includes("就诊记录") || text.includes("就医记录") || text.includes("随访") || text.includes("诊疗计划") || text.includes("治疗计划") || text.includes("治疗方案") || text.includes("根管治疗") || text.includes("复诊")) return "门诊记录";
  if (text.includes("报告") || text.includes("检查") || text.includes("血常规") || text.includes("胃镜")) return "检查报告";
  if (hasImageEvidence(text)) return "影像资料";
  return "OTHER";
}

export function normalizeRecordType(recordType: string, text: string): string {
  if ((recordType === "影像资料" || recordType === "IMAGE") && !hasImageEvidence(text)) return guessRecordType(text.replace(/影像资料/g, ""));
  return recordType;
}

function hasImageEvidence(text: string): boolean {
  return /(CT|MRI|DR|X光|X线|B超|超声|影像号|放射|片号|片子|影像检查|影像诊断|影像表现)/i.test(text);
}

function guessHealthConcern(text: string): string | null {
  if (text.includes("血压") || text.includes("高血压")) return "血压";
  if (text.includes("血糖") || text.includes("糖尿")) return "血糖";
  if (text.includes("胃") || text.includes("腹痛")) return "胃疼";
  if (text.includes("牙") || text.includes("口腔")) return "牙齿";
  if (text.includes("发热") || text.includes("发烧")) return "发热";
  if (text.includes("体检")) return "年度体检";
  return null;
}

function guessDate(text: string): string | null {
  const compact = text.match(/(20\d{2})([01]\d)([0-3]\d)/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const separated = text.match(/(20\d{2})[-_.年/]([01]?\d)[-_.月/]([0-3]?\d)/);
  if (!separated) return null;
  const [, year, month, day] = separated;
  if (!year || !month || !day) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function guessInstitution(text: string): string | null {
  const match = text.match(/([\u4e00-\u9fa5]{2,}(医院|卫生院|社区卫生服务中心|体检中心))/);
  return match?.[1] ?? null;
}

export function guessTitle(name: string, recordType: string, text = "", healthConcern: string | null = null): string {
  const cleanName = name.trim();
  const type = recordType && recordType !== "OTHER" && recordType !== "未识别" ? recordType : "病历资料";
  const topic =
    healthConcern ??
    (/牙|口腔|齿|龋|根管|洁牙/.test(text)
      ? "牙科"
      : /胃|肠|腹|消化|胃镜|肠镜/.test(text)
        ? "胃肠"
        : /体检|血常规|尿常规|肝功能|肾功能/.test(text)
          ? "体检"
          : null);
  if (topic) return `${topic}${type}`;
  if (looksMachineFileName(cleanName)) return type;
  return type === "病历资料" ? cleanName : `${type} · ${cleanName}`;
}

function looksMachineFileName(name: string): boolean {
  return !name || /^[a-f0-9]{16,}$/i.test(name) || /^[0-9a-f-]{24,}$/i.test(name) || /^IMG_|^DSC_|^\d{8,}/i.test(name);
}

function stripExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
