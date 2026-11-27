import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import { strFromU8, unzipSync } from "fflate";

/**
 * Browser-side résumé text extraction.
 *
 * This module deliberately has no product-level file-size, page-count, or extracted-text cap.
 * The browser still has finite memory, and the hosting platform can impose request/runtime limits.
 * Failures caused by those limits are returned as readable errors; input is never silently clipped.
 */

export type ResumeSourceLine = {
  text: string;
  label: string;
  page?: number;
  paragraph?: number;
  line?: number;
  method: "pdf-text" | "ocr" | "docx";
};

export type ResumeParseWarning = {
  message: string;
  page?: number;
};

export type ResumeProgress = {
  phase: "open" | "pdf-text" | "ocr" | "docx";
  completed: number;
  total?: number;
  page?: number;
};

export type ResumeParseResult = {
  sources: ResumeSourceLine[];
  warnings: ResumeParseWarning[];
  pages: number;
  ocrPages: number[];
};

export type ResumeOcrAdapter = {
  recognize(canvas: HTMLCanvasElement): Promise<string>;
  dispose?(): Promise<void> | void;
};

export type ResumeParserOptions = {
  onProgress?: (progress: ResumeProgress) => void;
  /** An app-provided OCR adapter takes precedence over the built-in Tesseract.js adapter. */
  ocrAdapter?: ResumeOcrAdapter;
  /** Defaults to 2200 CSS pixels on the longest page edge to bound per-page canvas memory. */
  ocrMaxEdge?: number;
  /** PDF pages with less searchable text than this are offered to OCR. */
  ocrTextThreshold?: number;
};

type TextItemLike = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

type OcrWorkerLike = {
  recognize(canvas: HTMLCanvasElement): Promise<{ data?: { text?: string } }>;
  terminate(): Promise<unknown>;
};

function fail(message: string): Error {
  return new Error(message);
}

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\u00a0 ]+/g, " ").trim())
    .filter(Boolean);
}

function pdfTextLines(items: readonly unknown[], pageNumber: number): ResumeSourceLine[] {
  const textItems = items.filter(
    (item): item is TextItemLike =>
      typeof item === "object" && item !== null && typeof (item as TextItemLike).str === "string",
  );

  const positioned = textItems
    .map((item, order) => ({
      text: item.str ?? "",
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      hasEOL: item.hasEOL ?? false,
      order,
    }))
    .filter((item) => item.text.trim());

  // Group text spans by baseline, then order spans left-to-right within each visual line.
  positioned.sort((a, b) => b.y - a.y || a.x - b.x || a.order - b.order);
  const groups: Array<{ y: number; spans: typeof positioned }> = [];
  for (const span of positioned) {
    const current = groups.at(-1);
    if (!current || Math.abs(current.y - span.y) > 2.5) {
      groups.push({ y: span.y, spans: [span] });
    } else {
      current.spans.push(span);
    }
  }

  return groups
    .map((group, index) => {
      group.spans.sort((a, b) => a.x - b.x || a.order - b.order);
      const text = group.spans.map((span) => span.text).join("").trim();
      if (!text) return null;
      return {
        text,
        page: pageNumber,
        line: index + 1,
        label: `第 ${pageNumber} 页 · 第 ${index + 1} 行 · PDF`,
        method: "pdf-text" as const,
      };
    })
    .filter((line): line is ResumeSourceLine => line !== null);
}

async function createTesseractAdapter(): Promise<ResumeOcrAdapter> {
  const { createWorker } = await import("tesseract.js");
  const worker = (await createWorker("chi_sim+eng", undefined, {
    workerPath: "/tesseract.worker.min.js",
    corePath: "/tesseract-core/tesseract-core-simd-lstm.wasm.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    gzip: true,
  })) as unknown as OcrWorkerLike;
  return {
    async recognize(canvas) {
      const result = await worker.recognize(canvas);
      return result.data?.text ?? "";
    },
    async dispose() {
      await worker.terminate();
    },
  };
}

async function renderPageForOcr(page: PDFPageProxy, maxEdge: number): Promise<HTMLCanvasElement> {
  const viewportAtOne = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, maxEdge / Math.max(viewportAtOne.width, viewportAtOne.height, 1));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw fail("浏览器无法创建扫描页图像，无法执行 OCR。");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas;
}

async function parsePdf(file: File, options: ResumeParserOptions): Promise<ResumeParseResult> {
  options.onProgress?.({ phase: "open", completed: 0 });
  let input: Uint8Array<ArrayBuffer>;
  try {
    input = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw fail("浏览器无法读取这个 PDF。设备内存有限，请关闭其他大型文件后重试。");
  }

  // Let the bundler package the matching PDF.js worker with this module.
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  let pdf: PDFDocumentProxy | undefined;
  let ocr: ResumeOcrAdapter | undefined = options.ocrAdapter;
  let triedDefaultOcr = Boolean(options.ocrAdapter);
  const warnings: ResumeParseWarning[] = [];
  const ocrPages: number[] = [];
  const sources: ResumeSourceLine[] = [];
  const threshold = options.ocrTextThreshold ?? 120;
  const maxEdge = options.ocrMaxEdge ?? 2200;

  try {
    const loading = getDocument({
      data: input,
      cMapUrl: "/pdfjs-cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs-standard-fonts/",
      isEvalSupported: false,
      useWorkerFetch: true,
      enableXfa: false,
    });
    pdf = await loading.promise;
    const pageCount = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      options.onProgress?.({ phase: "pdf-text", completed: pageNumber - 1, total: pageCount, page: pageNumber });
      let page: PDFPageProxy | undefined;
      let canvas: HTMLCanvasElement | undefined;
      try {
        page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageLines = pdfTextLines(textContent.items, pageNumber);
        const searchableText = pageLines.map((line) => line.text).join("");
        // Keep any searchable overlay from a mixed text/image page, even when OCR is used too.
        sources.push(...pageLines);

        if (searchableText.length >= threshold) {
          // Text page: its lines are already recorded above.
        } else {
          // A short/empty text layer can indicate a scanned page. OCR is attempted but never
          // blocks text-only extraction if the adapter, browser worker, or language data fails.
          try {
            if (!ocr && !triedDefaultOcr) {
              triedDefaultOcr = true;
              ocr = await createTesseractAdapter();
            }
            if (!ocr) throw fail("当前环境没有可用的 OCR 适配器。");
            options.onProgress?.({ phase: "ocr", completed: ocrPages.length, total: pageCount, page: pageNumber });
            canvas = await renderPageForOcr(page, maxEdge);
            const recognized = splitLines(await ocr.recognize(canvas));
            if (!recognized.length) {
              warnings.push({ message: "未识别到文字，请对照原件手动核对。", page: pageNumber });
            } else {
              ocrPages.push(pageNumber);
              sources.push(
                ...recognized.map((text, index) => ({
                  text,
                  page: pageNumber,
                  line: index + 1,
                  label: `第 ${pageNumber} 页 · OCR · 第 ${index + 1} 行`,
                  method: "ocr" as const,
                })),
              );
            }
          } catch (error) {
            warnings.push({
              message: error instanceof Error ? `扫描页 OCR 失败：${error.message}` : "扫描页 OCR 失败，请手动核对。",
              page: pageNumber,
            });
          }
        }
      } catch (error) {
        warnings.push({
          message: error instanceof Error ? `该页读取失败：${error.message}` : "该页读取失败，请手动核对。",
          page: pageNumber,
        });
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page?.cleanup();
        // PDF.js can release decoded page resources before the next page is opened.
        await pdf.cleanup().catch(() => false);
      }
      options.onProgress?.({ phase: "pdf-text", completed: pageNumber, total: pageCount, page: pageNumber });
    }

    if (pageCount > 0 && !sources.length && !warnings.length) {
      warnings.push({ message: "PDF 中没有读到可用文字，请尝试 Word 文件或手动填写。" });
    }
    return { sources, warnings, pages: pageCount, ocrPages };
  } catch (error) {
    if (error instanceof Error && /password|encrypted/i.test(error.message)) {
      throw fail("该 PDF 已加密，请上传可读取的副本。");
    }
    if (error instanceof Error && /memory|allocation|array buffer/i.test(error.message)) {
      throw fail("浏览器内存不足，无法读取这个 PDF。没有产品级大小或页数上限；可尝试关闭其他大型文件后重试。");
    }
    throw fail(error instanceof Error ? `无法读取 PDF：${error.message}` : "无法读取 PDF，请检查文件后重试。");
  } finally {
    await ocr?.dispose?.();
    await pdf?.destroy();
    // Drop our source-buffer reference as soon as PDF.js is finished with the document.
    input = new Uint8Array(0);
  }
}

function collectWordText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (element.localName === "tab") return "\t";
  if (element.localName === "br" || element.localName === "cr") return "\n";
  return Array.from(element.childNodes, collectWordText).join("");
}

async function parseDocxFile(file: File, options: ResumeParserOptions): Promise<ResumeParseResult> {
  options.onProgress?.({ phase: "open", completed: 0 });
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw fail("浏览器无法读取这个 Word 文件。设备内存有限，请关闭其他大型文件后重试。");
  }

  try {
    options.onProgress?.({ phase: "docx", completed: 0 });
    const archive = unzipSync(bytes);
    const documentXml = archive["word/document.xml"];
    if (!documentXml) throw fail("Word 文件缺少正文，请检查文件是否完整。");

    const xml = new DOMParser().parseFromString(strFromU8(documentXml), "application/xml");
    if (xml.getElementsByTagName("parsererror").length) {
      throw fail("Word 正文 XML 无法解析，请重新导出后重试。");
    }
    const paragraphs = Array.from(
      xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p"),
    );
    const sources: ResumeSourceLine[] = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const text = collectWordText(paragraph);
      const lines = splitLines(text);
      lines.forEach((line, lineIndex) => {
        sources.push({
          text: line,
          paragraph: paragraphIndex + 1,
          line: lineIndex + 1,
          label: `Word · 第 ${paragraphIndex + 1} 段${lines.length > 1 ? ` · 第 ${lineIndex + 1} 行` : ""}`,
          method: "docx",
        });
      });
    });
    options.onProgress?.({ phase: "docx", completed: paragraphs.length, total: paragraphs.length });
    return { sources, warnings: [], pages: 0, ocrPages: [] };
  } catch (error) {
    if (error instanceof Error && /memory|allocation|array buffer/i.test(error.message)) {
      throw fail("浏览器内存不足，无法读取这个 Word 文件。没有产品级大小上限；可尝试关闭其他大型文件后重试。");
    }
    throw fail(error instanceof Error ? `无法读取 Word：${error.message}` : "无法读取 Word，请检查文件后重试。");
  } finally {
    bytes = new Uint8Array(0);
  }
}

/** Extract source lines from a user-selected .docx or .pdf file in the browser. */
export async function extractResumeFile(
  file: File,
  options: ResumeParserOptions = {},
): Promise<ResumeParseResult> {
  const name = file.name.toLocaleLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return parsePdf(file, options);
  }
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return parseDocxFile(file, options);
  }
  throw fail("请选择 Word（.docx）或 PDF 文件。");
}
