import test from "node:test";
import assert from "node:assert/strict";
import { dueAction } from "./pos-cash-sessions.mjs";

// Toronto summer time is UTC-4 and winter time is UTC-5.
test("opens each morning at 09:45 Toronto time", () => {
  assert.equal(dueAction(new Date("2026-11-22T14:45:00Z")), "open");
  assert.equal(dueAction(new Date("2026-07-22T13:45:00Z")), "open");
  assert.equal(dueAction(new Date("2026-11-22T14:30:00Z")), null);
});
test("closes Sunday to Wednesday and Saturday at 20:00", () => {
  assert.equal(dueAction(new Date("2026-11-23T01:00:00Z")), "close"); // Sunday 20:00
  assert.equal(dueAction(new Date("2026-11-24T01:00:00Z")), "close"); // Monday 20:00
  assert.equal(dueAction(new Date("2026-11-22T01:00:00Z")), "close"); // Saturday 20:00
});
test("closes Thursday and Friday at 23:00", () => {
  assert.equal(dueAction(new Date("2026-11-20T04:00:00Z")), "close"); // Thursday 23:00
  assert.equal(dueAction(new Date("2026-11-21T04:00:00Z")), "close"); // Friday 23:00
  assert.equal(dueAction(new Date("2026-11-20T01:00:00Z")), null); // Thursday 20:00
});
test("does not run outside configured windows", () => {
  assert.equal(dueAction(new Date("2026-11-22T19:00:00Z")), null);
  assert.equal(dueAction(new Date("2026-11-23T02:00:00Z")), null);
});
