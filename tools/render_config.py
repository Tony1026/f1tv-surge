#!/usr/bin/env python3
"""Render Surge config snippets and the installable module from config/ templates.

Two modes:

  python3 tools/render_config.py
      Local mode. __SCRIPT_BASE__ becomes this repository's absolute path.
      Output is meant for merging into a local Surge profile on this machine.

  python3 tools/render_config.py --url https://raw.githubusercontent.com/USER/f1tv-surge-maintenance/main
      Remote mode. __SCRIPT_BASE__ becomes the given URL, so the rendered
      module can be installed in Surge via "Install from URL".

Outputs are written to dist/ and never committed.
"""

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLACEHOLDER = "__SCRIPT_BASE__"

TEMPLATES = [
    ("config/f1tv-module.sgmodule", "f1tv-module.sgmodule"),
    ("config/f1tv-main-profile.template.conf", "f1tv-main-profile.conf"),
]


def main():
    parser = argparse.ArgumentParser(description="Render Surge snippets and module.")
    parser.add_argument(
        "--url",
        help="Base URL of the hosted repository, e.g. https://raw.githubusercontent.com/USER/f1tv-surge-maintenance/main",
    )
    args = parser.parse_args()

    base = args.url.rstrip("/") if args.url else str(ROOT)
    out_dir = ROOT / "dist"
    out_dir.mkdir(exist_ok=True)

    for src_name, out_name in TEMPLATES:
        text = (ROOT / src_name).read_text(encoding="utf-8")
        if PLACEHOLDER not in text:
            raise SystemExit(f"模板缺少占位符 {PLACEHOLDER}：{src_name}")
        rendered = text.replace(PLACEHOLDER, base)
        (out_dir / out_name).write_text(rendered, encoding="utf-8")
        print(f"已生成 dist/{out_name}（脚本基址：{base}）")


if __name__ == "__main__":
    main()
