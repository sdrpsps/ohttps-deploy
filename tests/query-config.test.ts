import assert from "node:assert/strict";
import { queryKeys } from "../app/lib/api";
import { queryDefaults } from "../app/lib/query-config";

assert.equal(queryDefaults.staleTime, 30_000);
assert.equal(queryDefaults.refetchOnWindowFocus, false);
assert.equal(queryDefaults.refetchOnReconnect, false);
assert.equal(queryDefaults.retry, 1);
assert.notDeepEqual(queryKeys.logs("certificateId=one"), queryKeys.logs("certificateId=two"));
