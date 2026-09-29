#!/usr/bin/env python3
"""Start a full Surge probe and wait for its persisted result."""

import json
import subprocess
import sys
import time
from pathlib import Path


SURGE_CLI = Path("/Applications/Surge.app/Contents/Applications/surge-cli")
STATE_FILE = (
    Path.home()
    / "Library/Application Support/com.nssurge.surge-mac/SGJSVMPersistentStore/f1tv.nodes.v1"
)
SCRIPT_NAME = "f1tv-probe-cron"
MAX_WAIT_SECONDS = 900
STALL_SECONDS = 90


def read_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def main():
    if not SURGE_CLI.is_file():
        print("未找到 Surge 命令行工具。请确认 Surge 安装在“应用程序”文件夹。")
        return 1

    state = read_state()
    last_run = state.get("lastRun") or {}
    updated_at = int(state.get("updatedAt") or 0)
    active = last_run.get("status") == "in_progress" and time.time() - updated_at < STALL_SECONDS
    if active:
        print("已有全量检测正在运行，等待它完成。")
        seen_at = updated_at - 1
    else:
        print("正在启动全量检测。Surge 命令行控制器可能在 60 秒后退出，检测会继续。")
        seen_at = updated_at
        result = subprocess.run(
            [str(SURGE_CLI), "script", "run", SCRIPT_NAME],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode and "controller command timed out after 60 seconds" not in result.stdout + result.stderr:
            print("启动检测失败：" + (result.stderr or result.stdout).strip())
            return 1

    deadline = time.monotonic() + MAX_WAIT_SECONDS
    last_progress_at = time.monotonic()
    reported_count = None
    while time.monotonic() < deadline:
        state = read_state()
        updated_at = int(state.get("updatedAt") or 0)
        last_run = state.get("lastRun") or {}
        if updated_at > seen_at:
            seen_at = updated_at
            last_progress_at = time.monotonic()
            status = last_run.get("status")
            count = int(last_run.get("count") or 0)
            if status == "in_progress":
                if count != reported_count:
                    print(f"已检测 {count} 个节点。", flush=True)
                    reported_count = count
            elif status == "ok":
                print(f"全量检测完成：本次检测了 {count} 个节点。")
                return 0
            else:
                print(f"检测未完成：{status or '未知状态'}，本次检测了 {count} 个节点。")
                return 1
        if time.monotonic() - last_progress_at > STALL_SECONDS:
            print("检测进度超过 90 秒未更新，请查看 Surge 的脚本日志。")
            return 1
        time.sleep(2)

    print("等待检测结果超过 900 秒，请查看 Surge 的脚本日志。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
