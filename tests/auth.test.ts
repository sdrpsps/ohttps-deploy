import assert from "node:assert/strict";
import { auth } from "../app/lib/auth";

assert.equal(auth.options.emailAndPassword?.enabled, true);
assert.equal(auth.options.emailAndPassword?.disableSignUp, true);
console.log("auth tests passed");
