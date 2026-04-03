#!/usr/bin/env python3
"""中文音频转文字 — FunASR/Paraformer-zh + ct-punc

若当前 python3 缺少 funasr，自动搜索 pyenv/conda 中已安装 funasr 的解释器并 re-exec。
"""

import os
import subprocess
import sys


def _find_funasr_python():
    """在 pyenv versions 中搜索安装了 funasr 的 python3。"""
    pyenv_root = os.path.expanduser("~/.pyenv/versions")
    if not os.path.isdir(pyenv_root):
        return None
    for entry in sorted(os.listdir(pyenv_root), reverse=True):
        candidate = os.path.join(pyenv_root, entry, "bin", "python3")
        if os.path.isfile(candidate):
            try:
                result = subprocess.run(
                    [candidate, "-c", "import funasr"],
                    capture_output=True,
                    timeout=10,
                )
                if result.returncode == 0:
                    return candidate
            except Exception:
                continue
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 transcribe_zh.py <audio_file>", file=sys.stderr)
        sys.exit(1)

    # 抑制 FunASR/jieba 的 debug/warning 日志
    import logging
    logging.disable(logging.WARNING)

    # 尝试导入 funasr；失败则自动寻找正确的 python 并 re-exec
    try:
        from funasr import AutoModel
    except ImportError:
        alt = _find_funasr_python()
        if alt and alt != sys.executable:
            os.execv(alt, [alt] + sys.argv)
        print(
            "Error: funasr not found. Install with: pip install funasr",
            file=sys.stderr,
        )
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.isfile(audio_path):
        print(f"Error: file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    # FunASR 初始化和推理时会往 stdout 打印版本/下载/进度信息，
    # 临时将 stdout 重定向到 devnull，只保留最终转写文本
    _real_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")
    try:
        model = AutoModel(
            model="paraformer-zh",
            punc_model="ct-punc",
            disable_update=True,
            disable_log=True,
        )
        result = model.generate(input=audio_path)
    finally:
        sys.stdout.close()
        sys.stdout = _real_stdout

    for r in result:
        print(r["text"])


if __name__ == "__main__":
    main()
