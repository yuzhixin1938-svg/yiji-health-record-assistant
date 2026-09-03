import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnvironment } from "../src/config/environment.js";

describe("environment configuration", () => {
  it("uses safe local defaults", () => {
    const environment = loadEnvironment({});
    assert.equal(environment.NODE_ENV, "development");
    assert.equal(environment.PORT, 3001);
    assert.match(environment.DATABASE_URL, /^postgresql:\/\//);
  });

  it("rejects an invalid port", () => {
    assert.throws(() => loadEnvironment({ PORT: "70000" }), /Invalid environment configuration/);
  });
});
