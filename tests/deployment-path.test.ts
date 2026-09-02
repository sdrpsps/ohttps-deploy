import assert from "node:assert/strict";
import { deploymentPaths } from "../app/domain/deployment-path";

assert.deepEqual(deploymentPaths("Example.COM"), { certPath: "/etc/nginx/ssl/example.com/fullchain.pem", privateKeyPath: "/etc/nginx/ssl/example.com/privkey.pem" });
assert.throws(() => deploymentPaths("../etc"), /not safe/);
console.log("deployment path tests passed");
