#!/usr/bin/env python3
"""Render Surge config snippets and the installable module from config/ templates.

Two modes:

  python3 tools/render_config.py
      Local mode. The script base becomes this repository's absolute path.
      Output is meant for merging into a local Surge profile on this machine.

  python3 tools/render_config.py --url https://raw.githubusercontent.com/USER/f1tv-surge-maintenance/main
      Remote mode. The script base becomes the given URL, so the rendered
      module can be installed in Surge via "Install from URL".

Rendering is idempotent: files that still carry the __SCRIPT_BASE__
placeholder are filled in, and already-rendered files get every
script-path base re-pointed to the new location. Outputs are written
to dist/ and never committed.
"""

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLACEHOLDER = "__SCRIPT_BASE__"
SCRIPT_BASE_RE = re.compile(r'(?<=script-path=)[^,"\r\n]+?(?=/src/)')

TEMPLATES = [
    ("config/f1tv-module.sgmodule", "f1tv-module.sgmodule"),
    ("config/f1tv-main-profile.template.conf", "f1tv-main-profile.conf"),
]


def render(text, base):
    if PLACEHOLDER in text:
        return text.replace(PLACEHOLDER, base)
    return SCRIPT_BASE_RE.sub(lambda m: base, text)


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
        (out_dir / out_name).write_text(render(text, base), encoding="utf-8")
        print(f"已生成 dist/{out_name}（脚本基址：{base}）")


if __name__ == "__main__":
    main()
