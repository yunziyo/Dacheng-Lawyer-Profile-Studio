// Per-page OCR helper for the unified workbench.
// Usage: ocr <image-path>  → prints recognized text lines (zh-Hans + en-US).
import Vision
import AppKit

func recognize(path: String) -> [String] {
    let url = URL(fileURLWithPath: path)
    guard let image = NSImage(contentsOf: url),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return []
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    if #available(macOS 13.0, *) {
        request.revision = VNRecognizeTextRequestRevision3
    }
    if let langs = try? VNRecognizeTextRequest.supportedRecognitionLanguages(for: .accurate, revision: request.revision) {
        let preferred = ["zh-Hans", "zh-Hant", "en-US"].filter { langs.contains($0) }
        if !preferred.isEmpty { request.recognitionLanguages = preferred }
    }
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([request]) } catch { return [] }
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
}

let args = CommandLine.arguments
guard args.count >= 2 else { FileHandle.standardError.write("usage: ocr <image>\n".data(using: .utf8)!); exit(2) }
for line in recognize(path: args[1]) { print(line) }
