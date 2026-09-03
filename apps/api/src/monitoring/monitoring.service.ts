import { Injectable } from "@nestjs/common";
import { scrubText } from "./scrub.js";

@Injectable()
export class MonitoringService {
  recordClientError(input: {
    requestId: string;
    type: string;
    message?: string;
    page?: string;
    userAction?: string;
  }): { ok: true } {
    const event = {
      level: "error",
      event: "client_error",
      requestId: input.requestId,
      type: scrubText(input.type, 80),
      message: scrubText(input.message, 600),
      page: scrubText(input.page, 200),
      userAction: scrubText(input.userAction, 80),
    };

    process.stderr.write(`${JSON.stringify(event)}\n`);
    return { ok: true };
  }
}
