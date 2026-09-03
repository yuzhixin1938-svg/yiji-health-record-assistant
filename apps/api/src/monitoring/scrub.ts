import { createHash } from "node:crypto";

const sensitivePatterns: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\b1[3-9]\d{9}\b/g, "[phone]"],
  [/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g, "[token]"],
  [/(病历正文|诊断名称|药品名称|OCR原文|ocrRawText|rawText)["':：\s]+[^,，}\n]+/gi, "$1:[redacted]"],
];

export function scrubText(value: unknown, maxLength = 600): string {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  for (const [pattern, replacement] of sensitivePatterns) {
    text = text.replace(pattern, replacement);
  }
  return text.slice(0, maxLength);
}

export function sha256Short(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 16);
}
