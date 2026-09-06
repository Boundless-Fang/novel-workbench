@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   小说工作台启动器
echo ============================================
echo.

if not exist "web\server.mjs" (
  echo [错误] 找不到 web\server.mjs
  echo 请确认本文件位于项目根目录：小说生成全流程\
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 18 或更高版本
  pause
  exit /b 1
)

echo 正在启动本地服务：http://127.0.0.1:4173
echo 关闭弹出的黑色窗口即可停止服务。
echo.

pushd "%~dp0web"
start "小说工作台" cmd /k "node server.mjs"
popd

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173"

endlocal
