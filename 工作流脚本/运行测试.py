"""小说工作台统一测试入口。

按套件分层运行，默认全部执行（不含真实模型调用）：

  python 工作流脚本/运行测试.py                     # 全部：单元 + 流程 + 服务端 + 前端 + 验收
  python 工作流脚本/运行测试.py --suite 单元        # 只跑后端单元测试
  python 工作流脚本/运行测试.py --suite 验收 --live-model   # 验收套件额外执行真实模型端到端（消耗 API 额度）

套件说明：
  单元   测试/测试后端单元.py     共享模块 / LLM 配置 / 引擎输入解析（无服务、无模型）
  流程   验证完整流程.py            无模型引擎全流程与格式门禁
  服务端 测试/测试服务端接口.py    自起 server.mjs 的 REST 黑盒契约（测试端口 4199）
  前端   测试/测试前端契约.py      app.js / index.html / server.mjs / styles.css 引用一致性
  验收   验证工作台验收.py         端到端 27 项验收；需要 4173 服务（本入口会自动起停）
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
TESTS = HERE / "测试"
WEB = HERE.parent / "web"
PYTHON = sys.executable

SUITES = ("单元", "流程", "服务端", "前端", "验收")


def server_ready(port: int) -> bool:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/api/projects", timeout=1)
        return True
    except Exception:
        return False


def run_suite(name: str, live_model: bool) -> tuple[bool, str]:
    if name == "单元":
        return run_script([PYTHON, str(TESTS / "测试后端单元.py")]), "无服务、无模型"
    if name == "流程":
        return run_script([PYTHON, str(HERE / "验证完整流程.py")]), "无服务、无模型"
    if name == "服务端":
        return run_script([PYTHON, str(TESTS / "测试服务端接口.py")], env_overrides={"NOVEL_TEST_PORT": "4199"}), "自动起停测试服务（4199）"
    if name == "前端":
        return run_script([PYTHON, str(TESTS / "测试前端契约.py")]), "静态检查，无服务"
    if name == "验收":
        return run_acceptance(live_model), "自动起停 4173 服务"
    raise ValueError(name)


def run_script(command: list[str], env_overrides: dict[str, str] | None = None) -> bool:
    import os
    env = {**os.environ, **(env_overrides or {})}
    proc = subprocess.run(command, cwd=str(HERE), env=env)
    return proc.returncode == 0


def run_acceptance(live_model: bool) -> bool:
    command = [PYTHON, str(HERE / "验证工作台验收.py")]
    if live_model:
        command.append("--live-model")
    server = None
    own_server = not server_ready(4173)
    if own_server:
        import os
        print("（自动启动 4173 服务用于验收）")
        server = subprocess.Popen(["node", "server.mjs"], cwd=str(WEB), env=os.environ.copy(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            if server_ready(4173):
                break
            time.sleep(0.2)
        else:
            server.terminate()
            return False
    try:
        return run_script(command)
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
            print("（验收完成，已关闭自动启动的服务）")


def main() -> int:
    parser = argparse.ArgumentParser(description="小说工作台统一测试入口")
    parser.add_argument("--suite", choices=[*SUITES, "全部"], default="全部", help="选择要运行的测试套件")
    parser.add_argument("--live-model", action="store_true", help="验收套件额外执行真实模型端到端（消耗 API 额度）")
    args = parser.parse_args()
    selected = list(SUITES) if args.suite == "全部" else [args.suite]

    print("=" * 46)
    print("小说工作台测试")
    print("=" * 46)
    results: dict[str, bool] = {}
    for name in selected:
        print(f"\n--- {name} ---")
        ok = False
        try:
            ok = run_suite(name, args.live_model)[0]
        except Exception as error:
            print(f"FAIL 套件异常：{type(error).__name__}: {error}")
        results[name] = ok
        print(f"=> {name}：{'通过' if ok else '失败'}")

    print("\n" + "=" * 46)
    print("汇总：")
    for name, ok in results.items():
        print(f"  {'PASS' if ok else 'FAIL'} {name}")
    failed = [name for name, ok in results.items() if not ok]
    print("=" * 46)
    if failed:
        print(f"失败套件：{'、'.join(failed)}")
        return 1
    print("全部通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
