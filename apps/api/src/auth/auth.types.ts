import type { Request } from "express";

export type AuthenticatedUser = {
  id: string;
  sessionId: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
  requestId: string;
};
