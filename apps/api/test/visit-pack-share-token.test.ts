import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVisitPackShareToken,
  hashVisitPackShareToken,
} from "../src/visit-packs/visit-pack-share-token.js";

describe("visit pack share token", () => {
  it("creates a plain token and a separate hash for storage", () => {
    const result = createVisitPackShareToken();

    assert.match(result.token, /^[A-Za-z0-9_-]+$/);
    assert.equal(result.token.length > 32, true);
    assert.notEqual(result.tokenHash, result.token);
    assert.equal(result.tokenHash, hashVisitPackShareToken(result.token));
  });

  it("creates different tokens each time", () => {
    const first = createVisitPackShareToken();
    const second = createVisitPackShareToken();

    assert.notEqual(first.token, second.token);
    assert.notEqual(first.tokenHash, second.tokenHash);
  });

  it("hashes the same token consistently for lookup", () => {
    const token = "share-token-from-url";

    assert.equal(hashVisitPackShareToken(token), hashVisitPackShareToken(token));
  });
});
