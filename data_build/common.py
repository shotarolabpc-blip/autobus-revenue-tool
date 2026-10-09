"""data_build で共通に使う処理（パス・ダウンロード・JSON出力・容量表示）。"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = ROOT / "data_raw"
PUBLIC_DATA = ROOT / "public" / "data"

# 都道府県コード（JIS X 0401）。東京都専用の分岐は書かない（CLAUDE.md ルール8）
PREF_CODE_RE = re.compile(r"^(0[1-9]|[1-3][0-9]|4[0-7])$")


def check_pref_code(code: str) -> str:
    if not PREF_CODE_RE.match(code):
        raise SystemExit(f"都道府県コードは 01〜47 の2桁で指定してください: {code!r}")
    return code


def download(url: str, dest: Path) -> Path:
    """ログイン・同意が不要な公開データだけを取得する。既にあれば再取得しない。"""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  取得中: {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "autobus-revenue-tool data_build"})
    with urllib.request.urlopen(req, timeout=600) as res, open(tmp, "wb") as f:
        while chunk := res.read(1 << 20):
            f.write(chunk)
    os.replace(tmp, dest)
    return dest


def vsizip(zip_path: Path, inner: str) -> str:
    """zip の中のファイルを GDAL で直接読むためのパス"""
    return f"/vsizip/{zip_path.as_posix()}/{inner}"


def write_json(path: Path, data: object) -> int:
    """区切り文字を詰めた JSON（UTF-8）を書き出し、バイト数を返す"""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8", newline="\n")
    return path.stat().st_size


def write_json_pretty(path: Path, data: object) -> None:
    """人が読む設定ファイル（attributions.json など）用"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def human_size(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:,.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} GB"


def dir_size(path: Path) -> tuple[int, int]:
    """(ファイル数, 合計バイト数)"""
    files = [p for p in path.rglob("*") if p.is_file()] if path.is_dir() else ([path] if path.exists() else [])
    return len(files), sum(p.stat().st_size for p in files)


def setup_console() -> None:
    """Windows のコンソールでも日本語を表示できるようにする"""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
