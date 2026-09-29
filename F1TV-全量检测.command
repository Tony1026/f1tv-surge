#!/bin/sh

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python3 "$project_dir/run_full_probe.py"
result=$?

printf '\n按回车键关闭窗口…'
IFS= read -r _ || true
exit "$result"
