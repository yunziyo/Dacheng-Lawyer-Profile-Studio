"""Read résumé files in memory and preserve the text behind every suggestion."""
import importlib.util
import re
import shutil
import subprocess
import sys
import zipfile
from io import BytesIO
from pathlib import Path

import fitz

HERE = Path(__file__).resolve().parent
legacy_file = HERE.parent / "简历转个人网站工作台" / "extractor.py"
spec = importlib.util.spec_from_file_location("resume_rules", legacy_file)
rules = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = rules
spec.loader.exec_module(rules)

LABEL_FIELDS = {"姓名": "name", "职务": "title", "电话": "phone", "邮箱": "email",
                "微信": "wechat", "简介": "about", "业务": "practice", "经历": "experience",
                "教育": "education", "成果": "achievement", "可能涉及客户或案件": "achievement"}
INLINE = re.compile(r"[ \t]*(姓名|律师姓名|现任职务|职务|职位|执业身份|联系电话|手机|电话|电子邮箱|邮箱|微信号|微信|个人简介|专业方向|执业经历|教育背景|代表案例)\s*[:：]\s*")
LABEL_ALIASES = {"律师姓名": "姓名", "现任职务": "职务", "职位": "职务", "执业身份": "职务",
                 "联系电话": "电话", "手机": "电话", "电子邮箱": "邮箱", "微信号": "微信"}
PHONE_CANDIDATE = re.compile(r"(?<![\w\d])(?:\+?86[ -]?)?(?:1[3-9]\d(?:[ -]?\d){8}|(?:\(?0\d{2,3}\)?[ -]?)\d{7,8})(?!\d)")


def image_text(page, seconds):
    binary = shutil.which("tesseract")
    if not binary:
        return ""
    scale = min(2.8, 2600 / max(1, page.rect.width, page.rect.height))
    image = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    try:
        result = subprocess.run(
            [binary, "stdin", "stdout", "-l", "chi_sim+eng", "--psm", "3"],
            input=image.tobytes("png"), capture_output=True, timeout=seconds,
        )
        return result.stdout.decode(errors="replace").strip() if not result.returncode else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def read_source(name, data, max_pdf_pages, ocr_timeout):
    extension = Path(name.lower()).suffix
    if extension == ".docx":
        with zipfile.ZipFile(BytesIO(data)) as archive:
            # Use ZipFile's normal safety checks; don't impose a product-level
            # résumé byte or page cap. The host may still run out of memory.
            archive.testzip()
        return rules.read_docx(data), 0, [], []
    if extension != ".pdf":
        raise ValueError("请选择 Word（.docx）或 PDF 简历。")
    sources, warnings, ocr_pages = [], [], []
    with fitz.open(stream=data, filetype="pdf") as document:
        if document.needs_pass:
            raise ValueError("该 PDF 已加密，请上传解密后的副本。")
        if max_pdf_pages is not None and len(document) > max_pdf_pages:
            raise ValueError(f"该 PDF 有 {len(document)} 页，当前上限 {max_pdf_pages} 页。请选取简历相关页。")
        for number, page in enumerate(document, 1):
            raw = page.get_text("text", sort=True)
            searchable = "".join(raw.split())
            needs_ocr = bool(page.get_images()) and len(searchable) < 120
            recognized = image_text(page, ocr_timeout) if needs_ocr else ""
            if needs_ocr and recognized:
                ocr_pages.append(number)
            elif needs_ocr:
                warnings.append(f"第 {number} 页未识别到扫描文字，请核对原件或手动填写。")

            existing = {line.casefold() for line in raw.splitlines() if line.strip()}
            for index, line in enumerate(raw.splitlines(), 1):
                if line.strip():
                    sources.append(rules.Line(line.strip(), f"第 {number} 页 · 第 {index} 行 · PDF"))
            if recognized:
                for index, line in enumerate(recognized.splitlines(), 1):
                    value = line.strip()
                    if value and value.casefold() not in existing:
                        sources.append(rules.Line(value, f"第 {number} 页 · OCR · 第 {index} 行"))
        return sources, len(document), ocr_pages, warnings


def parse_resume(name, data, max_pdf_pages, ocr_timeout):
    lines, pages, ocr_pages, warnings = read_source(name, data, max_pdf_pages, ocr_timeout)
    if not lines:
        raise ValueError("；".join(warnings) or "没有读到可用文字，可以手动填写。")
    normalized = []
    for line in lines:
        marks = list(INLINE.finditer(line.text))
        if not marks:
            normalized.append(line)
            continue
        if line.text[:marks[0].start()].strip():
            normalized.append(rules.Line(line.text[:marks[0].start()].strip(), line.source))
        for index, mark in enumerate(marks):
            end = marks[index + 1].start() if index + 1 < len(marks) else len(line.text)
            label = LABEL_ALIASES.get(mark[1], mark[1])
            value = line.text[mark.end():end].strip(" ，,；;、")
            normalized.append(rules.Line(f"{label}：{value}", line.source))

    items, seen = [], set()
    raw_by_source = {line.source: (index, line.text) for index, line in enumerate(lines)}

    def add(field, value, source):
        value = value.strip()
        key = field, re.sub(r"\s+", "", value).casefold()
        if not value or key in seen:
            return
        seen.add(key)
        index, raw = raw_by_source[source]
        items.append({"field": field, "value": value, "sources": [index],
                      "review": "ocr" if " · OCR · " in source else "source"})

    for line in normalized:
        label, separator, value = line.text.partition("：")
        if separator and label in {"姓名", "职务", "微信"} and len(value.strip()) <= 80:
            add(LABEL_FIELDS[label], value, line.source)
        for match in rules.EMAIL_RE.finditer(line.text):
            add("email", match[0], line.source)
        for match in PHONE_CANDIDATE.finditer(line.text):
            # Ignore identification and account numbers even when they contain a phone-like string.
            if not rules.PRIVATE_RE.search(line.text):
                add("phone", match[0], line.source)

    if sum(len(line.text) for line in normalized) >= 20:
        for item in rules.extract(normalized)["items"]:
            field = LABEL_FIELDS.get(item["label"])
            if field and field not in {"phone", "email"}:
                if field == "title" and len(item["value"]) > 32:
                    continue
                add(field, item["value"], item["source"])

    return {"items": items, "sources": [{"text": line.text, "label": line.source} for line in lines],
            "warnings": warnings, "pages": pages, "ocrPages": ocr_pages}
