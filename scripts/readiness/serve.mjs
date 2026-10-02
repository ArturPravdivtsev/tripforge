import { startStack } from "./stack.mjs";

const stack = await startStack();
console.log("Stage 31 disposable production-build stack ready on http://127.0.0.1:3310");
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  try { await stack.close(); process.exitCode = 0; } catch (error) { console.error(error); process.exitCode = 1; }
});
