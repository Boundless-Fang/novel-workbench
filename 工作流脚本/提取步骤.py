"""同人原著的本地统计与 LLM 提取步骤；不包含向量索引。"""
from __future__ import annotations
from pathlib import Path
from typing import Any
from LLM配置 import policy_for
from 共享 import checked_write, fail, read_text, run_reference, safe_name, stage_project

MAPPING = {"text_stats": "f1a_local_text_stats.py", "word_frequency": "f2a_local_word_freq.py", "style": "f1b_llm_style_feature.py", "positive_vocabulary": "f2b_llm_keyword_base.py", "exclusive_vocabulary": "f3a_llm_exclusive_vocab.py"}
ARTIFACTS = {"text_stats": ("原文统计.txt", "statistics/统计指标.txt"), "word_frequency": ("高频词.txt", "statistics/高频词.txt"), "style": ("原文风格.md", "features.md"), "positive_vocabulary": ("正向词库.md", "positive_words.md"), "exclusive_vocabulary": ("专属词库.md", "exclusive_vocab.md")}

def _ensure_rag_index(source: Path, name: str, stage: Path) -> None:
    """f2b/f3a 依赖 f0 的全局 RAG 索引；缺失时先自动构建。"""
    extract_root = stage.parent.parent
    style_dir = extract_root / "text_style_imitation" / f"{source.stem}_style_imitation"
    index_path = style_dir / "global_rag_db" / "vector.index"
    if index_path.exists():
        return
    run_reference("f0_local_vector_indexer.py", ["--target_file", str(source)], "positive_vocabulary")

def run(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    source = base / "原著" / safe_name(data.get("source"), "原著文件名")
    if not source.exists(): fail("原著文件不存在")
    name, stage = stage_project(base)
    if task in {"positive_vocabulary", "exclusive_vocabulary"}:
        _ensure_rag_index(source, name, stage)
    log = run_reference(MAPPING[task], ["--target_file", str(source), "--project", name, "--model", policy_for(task).model], task)
    filename, relative_source = ARTIFACTS[task]
    source_file = (stage / relative_source) if task in {"style", "positive_vocabulary", "exclusive_vocabulary"} else (stage.parent.parent / "text_style_imitation" / f"{source.stem}_style_imitation" / relative_source)
    output = base / "提取" / filename
    checked_write(base, task, output, read_text(source_file))
    report = base / "提取" / f"{task}.log.md"; report.parent.mkdir(parents=True, exist_ok=True); report.write_text(f"# {task} 执行日志\n\n```text\n{log}\n```\n", encoding="utf-8")
    return [str(output.relative_to(base)), str(report.relative_to(base))]
