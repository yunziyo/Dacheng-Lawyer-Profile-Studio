"""Backend for the internal, account-free Dacheng workbench."""
import argparse
import base64
import hashlib
import io
import json
import logging
import mimetypes
import os
import re
import secrets
import shlex
import shutil
import sqlite3
import subprocess
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit
from zipfile import BadZipFile

def load_local_env():
    """Load an optional local .env without overriding service-provided vars."""
    path = Path(__file__).resolve().parent / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key, value = key.strip(), value.strip()
        if not key.startswith("DACHENG_"):
            continue
        try:
            parsed = shlex.split(value, comments=True, posix=True)
        except ValueError:
            continue
        os.environ.setdefault(key, parsed[0] if parsed else "")


load_local_env()

import fitz
from PIL import Image, ImageOps

from parse import parse_resume

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SETTINGS = json.loads((HERE / "config.json").read_text())
LAYOUTS = json.loads((HERE / "site-layouts.json").read_text())
STATE = Path(os.environ.get("DACHENG_DATA", HERE / "server-data")).expanduser().resolve()
DATABASE = STATE / "app.db"
OCR_TIMEOUT = 12
EXTRACT_SLOTS = threading.BoundedSemaphore(2)
BASE = ""
CONFIGURED_BASE = False
FIELDS = {
    "name": ("identity", "姓名", 100), "title": ("identity", "职务", 180),
    "hero": ("hero", "首页简介", 1000), "about": ("summary", "简介", 5000),
    "phone": ("contact", "电话", 80), "email": ("contact", "邮箱", 254),
    "wechat": ("contact", "微信", 160), "practice": ("practice", "业务", 1500),
    "experience": ("experience", "经历", 2500), "education": ("education", "教育", 1500),
    "achievement": ("achievement", "成果", 2500),
}
MULTI = {"practice", "experience", "education", "achievement"}
MEDIA = {"html": "text/html; charset=utf-8", "png": "image/png", "svg": "image/svg+xml"}
ASSETS = {
    "/": HERE / "index.html",
    "/workbench/app.js": HERE / "app.js", "/workbench/style.css": HERE / "style.css",
    "/site-renderer.js": HERE / "hosted-site/public/site-renderer.js",
    "/site-logo.js": HERE / "hosted-site/public/site-logo.js",
    "/card-engine.js": HERE / "hosted-site/public/card-engine.js",
    "/card-logo.js": HERE / "hosted-site/public/card-logo.js",
    "/brand.png": HERE / "hosted-site/public/brand.png",
    "/sample/resume.pdf": HERE / "hosted-site/public/sample/resume.pdf",
    "/sample/portrait.png": HERE / "hosted-site/public/sample/portrait.png",
}
THUMBS = {f"{number:02d}": HERE / "hosted-site/public/card-thumbnails" / f"{number:02d}.png"
          for number in range(1, 21)}
CSP = ("default-src 'none'; img-src data:; style-src 'unsafe-inline'; "
       "script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")


class Failure(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE, timeout=12)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def prepare():
    os.umask(0o077)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with database() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("""CREATE TABLE IF NOT EXISTS anonymous_sites (
            slug TEXT PRIMARY KEY, manage_hash TEXT UNIQUE NOT NULL,
            revision INTEGER NOT NULL, content TEXT NOT NULL, markup TEXT NOT NULL,
            active INTEGER NOT NULL CHECK (active IN (0, 1))
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS ai_handoffs (
            code_hash TEXT PRIMARY KEY,
            platform TEXT NOT NULL CHECK (platform = 'deepseek-harness'),
            state TEXT NOT NULL CHECK (state IN ('waiting', 'ready', 'consumed')),
            profile_json TEXT,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )""")


def clean(value, limit, label):
    if not isinstance(value, str) or len(value) > limit:
        raise Failure(f"请检查「{label}」的内容长度。")
    return value.replace("\x00", "").strip()


def image_url(value, max_size=1000):
    if not value:
        return ""
    if not isinstance(value, str) or len(value) > 8_000_000 or not re.fullmatch(
            r"data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+", value):
        raise Failure("请选择有效的 PNG、JPG 或 WebP 图片。")
    try:
        with Image.open(io.BytesIO(base64.b64decode(value.split(",", 1)[1], validate=True))) as picture:
            if picture.format not in {"PNG", "JPEG", "WEBP"} or picture.width * picture.height > 20_000_000:
                raise ValueError
            normalized = ImageOps.exif_transpose(picture).convert("RGBA")
            normalized.thumbnail((max_size, max_size))
            data = io.BytesIO()
            normalized.save(data, format="PNG", optimize=True)
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        raise Failure("无法读取这张图片。") from error
    return "data:image/png;base64," + base64.b64encode(data.getvalue()).decode()


def render(kind, **options):
    try:
        process = subprocess.run(["node", str(HERE / "render.cjs")],
                                 input=dumps({"kind": kind, **options}).encode(),
                                 capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Failure("生成服务暂不可用，请稍后重试。", 503) from error
    if process.returncode or not process.stdout:
        raise Failure("生成失败，请检查内容后重试。", 500)
    return process.stdout


def site_content(data):
    theme = data.get("theme")
    if not isinstance(theme, str) or theme not in LAYOUTS:
        raise Failure("请选择有效的网站模板。")
    items = data.get("items")
    if not isinstance(items, list) or len(items) > 100:
        raise Failure("请精简网站内容，最多展示 100 项。")
    published, singles = [], set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("field"), str) or item["field"] not in FIELDS:
            raise Failure("网站栏目格式不正确。")
        field = item["field"]
        category, label, limit = FIELDS[field]
        value = clean(item.get("value"), limit, label)
        if not value:
            continue
        if field not in MULTI:
            if field in singles:
                raise Failure(f"「{label}」只能选择一项。")
            singles.add(field)
        if field == "achievement" and item.get("disclosure") is not True:
            raise Failure("请逐项确认成果可以公开。")
        published.append({"field": field, "value": value, **({"disclosure": True} if field == "achievement" else {})})
    if "name" not in singles:
        raise Failure("请先确认姓名。")
    portrait = image_url(data.get("portrait"))
    return {"theme": theme, "items": published, "portrait": portrait}


def site_markup(content):
    items = []
    for item in content["items"]:
        category, label, _ = FIELDS[item["field"]]
        items.append({"category": category, "label": label, "status": "accepted", "value": item["value"],
                      "disclosureOk": item.get("disclosure", False), "visibility": "public"})
    theme = content["theme"]
    return render("site", items=items, theme=theme, portrait=content["portrait"], focus=LAYOUTS[theme]["focus"])


def manage_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def respond(self, data, media, status=200, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", media)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def reply(self, data, status=200):
        self.respond(dumps(data).encode(), "application/json; charset=utf-8", status)

    def page(self, data, status=200):
        self.respond(data, MEDIA["html"], status, {"Content-Security-Policy": CSP, "X-Robots-Tag": "noindex, nofollow"})

    def download(self, data, media, filename):
        self.respond(data, media, headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(filename, safe="")})

    def read(self, limit=None):
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0:
            raise Failure("请选择文件或填写内容。")
        if limit is not None and size > limit:
            raise Failure(f"提交内容超过 {limit // 1024**2} MB，请选取相关部分。", 413)
        data = self.rfile.read(size)
        if len(data) != size:
            raise Failure("上传中断，请重试。")
        return data

    def json(self, limit=12 * 1024**2):
        body = json.loads(self.read(limit))
        if not isinstance(body, dict):
            raise Failure("提交内容格式不正确。")
        return body

    def asset(self, path):
        file = ASSETS.get(path)
        match = re.fullmatch(r"/card-thumbnails/(\d\d)\.png", path)
        if match:
            file = THUMBS.get(match[1])
        match = re.fullmatch(r"/site-thumbnails/([a-z]+)\.png", path)
        if match and match[1] in LAYOUTS:
            file = HERE / "hosted-site/public/site-thumbnails" / f"{match[1]}.png"
        if not file or not file.is_file():
            return False
        suffix = file.suffix.lstrip(".")
        media = MEDIA.get(suffix, mimetypes.guess_type(file.name)[0] or "application/octet-stream")
        self.respond(file.read_bytes(), media)
        return True

    def extract(self, query):
        name = query.get("name", [""])[0]
        if not EXTRACT_SLOTS.acquire(blocking=False):
            raise Failure("当前有其他简历正在读取，请稍后重试。", 503)
        try:
            result = parse_resume(name, self.read(), None, OCR_TIMEOUT)
        except (BadZipFile, fitz.FileDataError) as error:
            raise Failure("文件无法打开，请检查或重新导出后再试。") from error
        finally:
            EXTRACT_SLOTS.release()
        self.reply(result)

    def create_handoff(self):
        body = self.json(16 * 1024)
        platform = body.get("platform")
        if platform != "deepseek-harness":
            raise Failure("当前仅支持 DeepSeek Harness。")
        now = int(time.time())
        # Handoffs are short-lived and single-use. The raw code is only returned
        # to the browser; SQLite stores its SHA-256 fingerprint.
        code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(10))
        fingerprint = hashlib.sha256(code.encode()).hexdigest()
        with database() as db:
            db.execute("DELETE FROM ai_handoffs WHERE expires_at < ? OR state='consumed'", (now,))
            db.execute("INSERT INTO ai_handoffs VALUES (?,?, 'waiting', NULL, ?, ?)",
                       (fingerprint, platform, now, now + 15 * 60))
        self.reply({"code": code[:5] + "-" + code[5:], "platform": platform,
                    "expiresAt": now + 15 * 60, "mcpUrl": BASE + "/mcp"}, 201)

    def poll_handoff(self):
        code = str(self.json(16 * 1024).get("code", "")).replace("-", "").upper()
        if not re.fullmatch(r"[A-HJ-NP-Z2-9]{10}", code):
            raise Failure("传输码格式不正确或已失效。", 404)
        now = int(time.time())
        fingerprint = hashlib.sha256(code.encode()).hexdigest()
        with database() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM ai_handoffs WHERE code_hash=?", (fingerprint,)).fetchone()
            if row is None or row["expires_at"] <= now:
                if row:
                    db.execute("DELETE FROM ai_handoffs WHERE code_hash=?", (fingerprint,))
                raise Failure("传输码已失效，请重新创建。", 410)
            if row["state"] == "waiting":
                return self.reply({"state": "waiting", "expiresAt": row["expires_at"]})
            if row["state"] == "consumed":
                return self.reply({"state": "consumed"})
            data = json.loads(row["profile_json"] or "{}")
            db.execute("UPDATE ai_handoffs SET state='consumed',profile_json=NULL WHERE code_hash=?", (fingerprint,))
            db.execute("DELETE FROM ai_handoffs WHERE code_hash=?", (fingerprint,))
        self.reply({"state": "ready", "items": data.get("items", []), "warnings": data.get("warnings", [])})

    def mcp(self):
        try:
            message = json.loads(self.read(2 * 1024**2))
        except (ValueError, UnicodeError) as error:
            raise Failure("MCP 请求不是有效的 JSON。", 400) from error
        if (not isinstance(message, dict) or message.get("jsonrpc") != "2.0"
                or not isinstance(message.get("method"), str)
                or (message.get("id") is not None and not isinstance(message.get("id"), (str, int)))):
            raise Failure("MCP 请求格式不正确。", 400)
        request_id = message.get("id")
        method = message["method"]
        if method == "notifications/initialized":
            return self.respond(b"", "application/json; charset=utf-8", 202)
        if method == "initialize":
            result = {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}},
                      "serverInfo": {"name": "dacheng-profile-bridge", "version": "1.0.0"}}
            return self.reply({"jsonrpc": "2.0", "id": request_id, "result": result})
        if method == "ping":
            return self.reply({"jsonrpc": "2.0", "id": request_id, "result": {}})
        if method == "tools/list":
            tool = {"name": "submit_confirmed_profile", "description":
                    "Submit lawyer-reviewed résumé fields to a one-time workbench transfer code. Do not call before showing the proposed fields and receiving explicit confirmation.",
                    "inputSchema": {"type": "object", "additionalProperties": False,
                       "required": ["code", "items"], "properties": {
                         "code": {"type": "string", "description": "The 10-character transfer code shown by the workbench."},
                         "items": {"type": "array", "maxItems": 100, "items": {"type": "object",
                           "additionalProperties": False, "required": ["field", "value"], "properties": {
                             "field": {"type": "string", "enum": sorted(FIELDS)},
                             "value": {"type": "string"},
                             "sources": {"type": "array", "maxItems": 8, "items": {"type": "string"}},
                             "reviewNote": {"type": "string"}}}},
                         "warnings": {"type": "array", "maxItems": 20, "items": {"type": "string"}}}}}
            return self.reply({"jsonrpc": "2.0", "id": request_id, "result": {"tools": [tool]}})
        if method != "tools/call":
            return self.reply({"jsonrpc": "2.0", "id": request_id,
                               "error": {"code": -32601, "message": "Method not found"}})
        params = message.get("params")
        if not isinstance(params, dict):
            return self.reply({"jsonrpc": "2.0", "id": request_id,
                               "error": {"code": -32602, "message": "Invalid params"}})
        if params.get("name") != "submit_confirmed_profile":
            return self.reply({"jsonrpc": "2.0", "id": request_id,
                               "error": {"code": -32602, "message": "Unknown tool"}})
        args = params.get("arguments")
        if not isinstance(args, dict):
            return self.reply({"jsonrpc": "2.0", "id": request_id,
                               "error": {"code": -32602, "message": "Invalid tool arguments"}})
        try:
            code = str(args.get("code", "")).replace("-", "").upper()
            if not re.fullmatch(r"[A-HJ-NP-Z2-9]{10}", code):
                raise Failure("传输码格式不正确或已失效。", 404)
            items = args.get("items")
            if not isinstance(items, list) or not items or len(items) > 100:
                raise Failure("没有可回填的资料项。")
            normalized = []
            for item in items:
                if not isinstance(item, dict) or item.get("field") not in FIELDS:
                    raise Failure("资料字段格式不正确。")
                field = item["field"]
                value = clean(item.get("value"), FIELDS[field][2], FIELDS[field][1])
                if not value:
                    continue
                sources = item.get("sources", [])
                if not isinstance(sources, list) or len(sources) > 8 or any(not isinstance(v, str) or len(v) > 600 for v in sources):
                    raise Failure("原文依据格式不正确。")
                note = item.get("reviewNote", "")
                if not isinstance(note, str) or len(note) > 300:
                    raise Failure("核对提示格式不正确。")
                normalized.append({"field": field, "value": value,
                                   "sources": sources,
                                   "reviewNote": note})
            if not normalized:
                raise Failure("没有有效的资料项。")
            warnings = args.get("warnings", [])
            if not isinstance(warnings, list) or len(warnings) > 20 or any(not isinstance(v, str) or len(v) > 300 for v in warnings):
                raise Failure("核对提示格式不正确。")
            fingerprint = hashlib.sha256(code.encode()).hexdigest()
            now = int(time.time())
            with database() as db:
                cursor = db.execute("""UPDATE ai_handoffs SET state='ready', profile_json=?
                    WHERE code_hash=? AND platform='deepseek-harness' AND state='waiting' AND expires_at>?""",
                    (dumps({"items": normalized, "warnings": warnings}), fingerprint, now))
                if cursor.rowcount != 1:
                    raise Failure("传输码已使用或过期，请回到工作台重新创建。", 410)
            result = {"content": [{"type": "text", "text": "资料已送回工作台。请律师切回工作台，检查每项候选资料并自行选择是否使用。"}], "isError": False}
            return self.reply({"jsonrpc": "2.0", "id": request_id, "result": result})
        except Failure as error:
            return self.reply({"jsonrpc": "2.0", "id": request_id,
                               "result": {"isError": True, "content": [{"type": "text", "text": str(error)}]}})

    def card(self):
        body = self.json()
        template, side, output = body.get("template"), body.get("side"), body.get("format")
        if template not in [f"{n:02d}" for n in range(1, 21)] or side not in ("front", "back") or output not in ("svg", "png"):
            raise Failure("请选择有效的模板、卡面和格式。")
        data = body.get("data")
        if not isinstance(data, dict):
            raise Failure("请填写名片资料。")
        keys = {"name": 60, "nameEn": 90, "title": 80, "practice": 100, "phone": 80,
                "email": 254, "address": 140, "website": 160}
        info = {key: clean(data.get(key, ""), cap, key) for key, cap in keys.items()}
        if not info["name"]:
            raise Failure("请先填写姓名。")
        info["qrData"] = image_url(data.get("qrData"), 1600) if side == "back" else ""
        content = render("card", template=template, side=side, data=info)
        if output == "png":
            binary = shutil.which("rsvg-convert")
            if not binary:
                raise Failure("服务器尚未配置 PNG 转换，可先下载矢量文件。", 503)
            result = subprocess.run([binary, "-w", "2160", "-h", "1296"], input=content,
                                    capture_output=True, timeout=20)
            if result.returncode or not result.stdout:
                raise Failure("PNG 生成失败，请重试。", 500)
            content = result.stdout
        self.download(content, MEDIA[output], f"{info['name']}_名片_{'正面' if side == 'front' else '背面'}.{output}")

    def public_link(self, slug):
        return f"{BASE}/p/{slug}"

    def public_site(self, slug):
        with database() as db:
            row = db.execute("SELECT active,markup FROM anonymous_sites WHERE slug=?", (slug,)).fetchone()
            if row is None and db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sites'").fetchone():
                row = db.execute("SELECT active,markup FROM sites WHERE slug=?", (slug,)).fetchone()
        if row and row["active"]:
            return self.page(row["markup"].encode())
        message = "该网站已撤回" if row else "找不到该网站"
        self.page(f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{message}</title><main style="margin:4rem auto;max-width:32rem;padding:1rem"><h1>{message}</h1></main></html>'.encode(), 410 if row else 404)

    def publish(self):
        body = self.json()
        if body.get("sample") is True:
            raise Failure("示例资料仅用于预览与下载，请换成自己的资料后发布。", 403)
        content = site_content(body)
        markup = site_markup(content).decode()
        slug, token = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
        with database() as db:
            db.execute("INSERT INTO anonymous_sites VALUES (?,?,1,?,?,1)",
                       (slug, manage_hash(token), dumps(content), markup))
        self.reply({"publicUrl": self.public_link(slug), "manageUrl": f"{BASE}/#/manage/{token}",
                    "revision": 1, "active": True}, 201)

    def manage(self, operation):
        match = re.fullmatch(r"Bearer ([A-Za-z0-9_-]{43})", self.headers.get("Authorization", ""))
        if not match:
            raise Failure("管理链接无效。", 404)
        fingerprint = manage_hash(match[1])
        with database() as db:
            row = db.execute("SELECT * FROM anonymous_sites WHERE manage_hash=?", (fingerprint,)).fetchone()
        if not row:
            raise Failure("管理链接无效。", 404)
        result = {"publicUrl": self.public_link(row["slug"]), "revision": row["revision"],
                  "active": bool(row["active"])}
        if operation == "read":
            return self.reply({**result, "content": json.loads(row["content"])})
        body = self.json()
        if body.get("sample") is True:
            raise Failure("示例资料不能发布。", 403)
        if not row["active"]:
            raise Failure("该网站已撤回。", 410)
        if body.get("revision") != row["revision"]:
            raise Failure("该网站已有更新，请重新打开管理链接后再操作。", 409)
        if operation == "withdraw":
            content, markup, active = {}, "", 0
        else:
            content = site_content(body)
            markup, active = site_markup(content).decode(), 1
        with database() as db:
            cursor = db.execute("""UPDATE anonymous_sites SET content=?,markup=?,active=?,revision=revision+1
                                   WHERE manage_hash=? AND revision=? AND active=1""",
                                (dumps(content), markup, active, fingerprint, row["revision"]))
            if cursor.rowcount != 1:
                raise Failure("该网站已有更新，请重新打开管理链接后再操作。", 409)
        self.reply({**result, "active": bool(active), "revision": row["revision"] + 1})

    def route(self):
        url = urlsplit(self.path)
        path = unquote(url.path)
        method = "GET" if self.command == "HEAD" else self.command
        if method == "POST" and path != "/mcp":
            origin = self.headers.get("Origin")
            # The published customer origin may differ from the internal workbench
            # host. Accept the request's own browser origin as well as the public
            # origin so internal deployments behind a split-horizon proxy can post.
            host = self.headers.get("Host", "")
            allowed = {BASE, f"http://{host}", f"https://{host}"}
            if (origin and origin not in allowed) or self.headers.get("Sec-Fetch-Site") == "cross-site":
                raise Failure("请从工作台页面操作。", 403)
        if method == "GET" and self.asset(path):
            return
        if method == "GET" and re.fullmatch(r"/p/[A-Za-z0-9_-]{12,48}", path):
            return self.public_site(path[3:])
        if (method, path) == ("GET", "/api/config"):
            return self.reply({"layouts": LAYOUTS,
                               "aiPlatforms": ["deepseek-harness"], "handoffMinutes": 15,
                               "mcpUrl": BASE + "/mcp", "localMode": not CONFIGURED_BASE})
        if (method, path) == ("POST", "/api/extract"):
            return self.extract(parse_qs(url.query))
        if (method, path) == ("POST", "/api/handoff/create"):
            return self.create_handoff()
        if (method, path) == ("POST", "/api/handoff/status"):
            return self.poll_handoff()
        if (method, path) == ("POST", "/mcp"):
            return self.mcp()
        if (method, path) == ("POST", "/api/card"):
            return self.card()
        if (method, path) == ("POST", "/api/site/html"):
            content = site_content(self.json())
            name = next(item["value"] for item in content["items"] if item["field"] == "name")
            return self.download(site_markup(content), MEDIA["html"], name + "_个人网站.html")
        if (method, path) == ("POST", "/api/site/publish"):
            return self.publish()
        if (method, path) == ("GET", "/api/site/manage"):
            return self.manage("read")
        if method == "POST" and path in {"/api/site/update", "/api/site/withdraw"}:
            return self.manage(path.rsplit("/", 1)[-1])
        raise Failure("找不到页面或接口。", 404)

    def handle_workbench(self):
        try:
            self.route()
        except Failure as error:
            self.reply({"error": str(error)}, error.status)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except (ValueError, UnicodeError) as error:
            message = str(error) if self.path.startswith("/api/extract") else "提交内容格式不正确。"
            self.reply({"error": message or "无法读取文件。"}, 400)
        except (OSError, subprocess.TimeoutExpired, sqlite3.Error) as error:
            logging.warning("Workbench request failed (%s)", type(error).__name__)
            self.reply({"error": "处理请求失败，请稍后重试。"}, 503)
        except Exception:
            logging.exception("Workbench request failed")
            self.reply({"error": "处理请求失败，请稍后重试。"}, 500)

    do_GET = handle_workbench
    do_HEAD = handle_workbench
    do_POST = handle_workbench


def main():
    global BASE, CONFIGURED_BASE
    arguments = argparse.ArgumentParser()
    arguments.add_argument("--port", default=int(os.getenv("DACHENG_PORT", SETTINGS["port"])), type=int)
    arguments.add_argument("--host", default=os.getenv("DACHENG_HOST", "127.0.0.1"))
    options = arguments.parse_args()
    external = os.getenv("DACHENG_PUBLIC_BASE") or SETTINGS.get("public_base")
    CONFIGURED_BASE = bool(external)
    BASE = (external or f"http://127.0.0.1:{options.port}").rstrip("/")
    origin = urlsplit(BASE)
    if origin.scheme not in {"http", "https"} or not origin.hostname or origin.username or origin.path or origin.query or origin.fragment:
        arguments.error("DACHENG_PUBLIC_BASE must be an HTTP(S) origin")
    prepare()
    with ThreadingHTTPServer((options.host, options.port), Handler) as server:
        print("大成深圳 · 个人宣传工作台", BASE, flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
