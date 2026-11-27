import { build } from "esbuild";
import { copyFile, cp, mkdir } from "node:fs/promises";

await build({
  entryPoints: ["lib/resume-parser.ts"],
  outfile: "public/resume-parser.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
});

await copyFile(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/pdf.worker.min.mjs",
);
await cp("node_modules/pdfjs-dist/cmaps", "public/pdfjs-cmaps", { recursive: true });
await cp("node_modules/pdfjs-dist/standard_fonts", "public/pdfjs-standard-fonts", { recursive: true });
await mkdir("public/tesseract-core", { recursive: true });
await copyFile("node_modules/tesseract.js/dist/worker.min.js", "public/tesseract.worker.min.js");
await copyFile(
  "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "public/tesseract-core/tesseract-core-simd-lstm.wasm.js",
);
await copyFile(
  "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
  "public/tesseract-core/tesseract-core-simd-lstm.wasm",
);
console.log("Browser résumé parser and PDF worker are ready.");
