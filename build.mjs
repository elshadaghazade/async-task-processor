import { build } from "esbuild";
import { rmSync, mkdirSync } from "fs";

const functions = [
  "validate_task",
  "process_task",
  "fail_task",
  "get_task",
  "list_tasks"
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await Promise.all(
  functions.map((fn) =>
    build({
      entryPoints: [`src/${fn}/handler.ts`],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      outfile: `dist/${fn}/handler.js`,
      external: ["@aws-sdk/*"],
      minify: false,
      sourcemap: false,
    }).then(() => console.log(`built: ${fn}`))
  )
);

console.log("build complete");
