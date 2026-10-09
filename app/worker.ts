import "dotenv/config";
import { fileURLToPath } from "node:url";
import { createLogger } from "./lib/logger";
import { runWorker } from "./worker/runtime";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runWorker().catch((error) => {
    createLogger("worker").error("worker crashed", { error: String(error) });
    process.exitCode = 1;
  });
}
