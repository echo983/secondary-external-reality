import assert from "node:assert/strict";
import test from "node:test";
import { registerEntityType, validateAttribute, validateEntityType, WorldSchemaError } from "../src/world/worldSchema.js";

test("registers a new entity type without touching the kernel's built-in types", () => {
  registerEntityType("test-registry-widget", ["zh_name", "en_name"]);
  assert.doesNotThrow(() => validateEntityType("test-registry-widget"));
  assert.doesNotThrow(() => validateAttribute("test-registry-widget", "zh_name", "小玩意"));
  assert.throws(() => validateAttribute("test-registry-widget", "portable", "true"), WorldSchemaError);
  // built-ins remain intact
  assert.doesNotThrow(() => validateEntityType("person"));
});

test("re-registering an identical attribute set is a no-op", () => {
  registerEntityType("test-registry-idempotent", ["zh_name"]);
  assert.doesNotThrow(() => registerEntityType("test-registry-idempotent", ["zh_name"]));
});

test("re-registering with a different attribute set is rejected", () => {
  registerEntityType("test-registry-conflict", ["zh_name"]);
  assert.throws(() => registerEntityType("test-registry-conflict", ["zh_name", "en_name"]), /already registered with a different attribute set/);
});

test("registering a built-in type with a different attribute set is rejected", () => {
  assert.throws(() => registerEntityType("person", ["zh_name"]), /already registered with a different attribute set/);
});
