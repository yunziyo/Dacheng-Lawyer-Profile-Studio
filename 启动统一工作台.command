#!/bin/zsh
set -eu
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PYTHONDONTWRITEBYTECODE=1

if ! command -v node >/dev/null || ! command -v tesseract >/dev/null || ! command -v rsvg-convert >/dev/null || ! python3 -c 'import fitz, docx, qrcode, PIL' 2>/dev/null; then
  print "启动需要 Node.js、Tesseract、librsvg 和 Python 依赖。请查看本目录《使用说明.md》。"
  read -r "?按回车关闭。" || true
  exit 1
fi

port="$(python3 -c 'import os,json; print(int(os.getenv("DACHENG_PORT", json.load(open("config.json"))["port"])))')"
url="http://127.0.0.1:$port/"
if curl -fsS --max-time 1 "$url" | grep -q "个人宣传工作台"; then
  open "$url"
  exit 0
fi

python3 server.py --port "$port" &
workbench_pid=$!
trap 'kill "$workbench_pid" 2>/dev/null || true' EXIT
trap 'exit 0' INT TERM
for attempt in {1..40}; do
  if ! kill -0 "$workbench_pid" 2>/dev/null; then
    print "工作台未启动。请检查上方提示及端口占用。"
    read -r "?按回车关闭。" || true
    exit 1
  fi
  if curl -fsS --max-time 1 "$url" | grep -q "个人宣传工作台"; then
    open "$url"
    print "请保持此窗口打开。按 Control-C 停止工作台。"
    wait "$workbench_pid"
    exit 0
  fi
  sleep 0.25
done
print "启动等待超时。"
exit 1
