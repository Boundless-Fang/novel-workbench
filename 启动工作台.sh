#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "============================================"
echo "  小说工作台启动器"
echo "============================================"
echo

if [ ! -f "web/server.mjs" ]; then
  echo "[错误] 找不到 web/server.mjs"
  echo "请确认本文件位于项目根目录：小说生成全流程/"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未找到 Node.js，请先安装 Node.js 18 或更高版本"
  exit 1
fi

echo "正在启动本地服务：http://127.0.0.1:4173"
echo "按 Ctrl+C 即可停止服务。"
echo

cd web
node server.mjs &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 2

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:4173" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:4173" >/dev/null 2>&1 || true
elif command -v cmd >/dev/null 2>&1; then
  cmd //c start "" "http://127.0.0.1:4173" >/dev/null 2>&1 || true
fi

wait "$SERVER_PID"
