import { createOpaqueToken, sha256 } from "../auth/token-utils.js";

const VISIT_PACK_SHARE_TOKEN_BYTES = 32;

export type VisitPackShareToken = {
  token: string;
  tokenHash: string;
};

export function createVisitPackShareToken(): VisitPackShareToken {
  const token = createOpaqueToken(VISIT_PACK_SHARE_TOKEN_BYTES);
  return {
    token,
    tokenHash: hashVisitPackShareToken(token),
  };
}

export function hashVisitPackShareToken(token: string): string {
  return sha256(token);
}
