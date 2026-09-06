#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""世界观 JSON 生成脚本（实验版）。

把世界观从“Markdown 标题校验”改为“结构化 JSON 校验”：
- 输入仍支持自然语言 / 结构化字段；
- 由 LLM 生成 JSON 对象；
- 写入 <项目>/知识库/世界观.json；
- 通过结构校验后才落盘，不再依赖固定 Markdown 标题词。

用法：
  python 世界观JSON.py --project 原创-作品名 --input_mode natural --natural_input "..."
  python 世界观JSON.py --project 原创-作品名 --input_mode structured --input '{"genre":"东方玄幻","premise":"..."}'
  python 世界观JSON.py --project 原创-作品名 --input_mode natural --natural_input "..." --mock

说明：
  --mock 不调用 LLM，使用内置示例数据，方便先试流程和校验。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from LLM配置 import generate_json, input_to_fields
from 共享 import project_dir, read_text

# 结构化世界观的 JSON Schema（给 LLM 看的字段说明，也用于校验）
WORLDVIEW_JSON_SCHEMA: dict[str, Any] = {
    "novel_type": "小说类型 / 题材",
    "worldview_basis": "世界观基础",
    "power_system": "力量体系（可以是字符串，也可以是对象）",
    "factions": [
        {
            "name": "势力名称",
            "status": "地位",
            "location": "位置",
            "key_characters": [
                {
                    "name": "角色名",
                    "role": "势力内身份",
                    "ability": "境界/能力",
                }
            ],
        }
    ],
    "resources": ["资源名称，或 {name, description} 对象"],
}

MOCK_WORLDVIEW: dict[str, Any] = {
    "novel_type": "东方玄幻",
    "worldview_basis": "九州大陆，灵气复苏，宗门林立，王朝与仙门共治。",
    "power_system": {
        "境界": ["练气", "筑基", "金丹", "元婴", "化神"],
        "修炼资源": ["灵石", "丹药", "功法"],
    },
    "factions": [
        {
            "name": "玄天宗",
            "status": "正道第一宗门",
            "location": "中州玄天山",
            "key_characters": [
                {"name": "沈栖迟", "role": "首席弟子", "ability": "金丹后期"}
            ],
        },
        {
            "name": "大夏王朝",
            "status": "世俗皇朝",
            "location": "中州皇都",
            "key_characters": [
                {"name": "陆闻洲", "role": "皇子", "ability": "筑基巅峰"}
            ],
        },
    ],
    "resources": ["灵石矿脉", "上古秘境", "灵兽"],
}


def build_context(base: Path) -> str:
    """汇总生成世界观时可参考的已确认项目上下文。"""
    parts = []
    for name, path in [
        ("小说简介", base / "知识库" / "小说简介.md"),
        ("初始化资料", base / "运行记录" / "初始化资料.md"),
        ("剧情书", base / "剧情" / "剧情书.md"),
        ("信息账本", base / "知识库" / "信息账本.md"),
    ]:
        text = read_text(path)
        if text:
            parts.append(f"【{name}】\n{text}")
    return "\n\n".join(parts) or "无额外已确认项目上下文。"


def validate_worldview_json(data: Any) -> list[str]:
    """返回 JSON 结构问题；空列表表示可以通过。"""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["世界观必须是 JSON 对象"]

    if not str(data.get("novel_type") or "").strip():
        errors.append("缺少字段：novel_type（小说类型）")
    if not str(data.get("worldview_basis") or "").strip():
        errors.append("缺少字段：worldview_basis（世界观基础）")

    power_system = data.get("power_system")
    if power_system in (None, "", [], {}):
        errors.append("缺少字段：power_system（力量体系）")
    elif not (isinstance(power_system, str) or isinstance(power_system, dict)):
        errors.append("power_system 必须是字符串或对象")

    factions = data.get("factions")
    if factions is None:
        errors.append("缺少字段：factions（势力）")
    elif not isinstance(factions, list):
        errors.append("factions 必须是数组")
    else:
        for i, faction in enumerate(factions):
            if not isinstance(faction, dict):
                errors.append(f"factions[{i}] 必须是对象")
                continue
            if not str(faction.get("name") or "").strip():
                errors.append(f"factions[{i}].name（势力名称）不能为空")
            key_characters = faction.get("key_characters")
            if key_characters is not None and not isinstance(key_characters, list):
                errors.append(f"factions[{i}].key_characters 必须是数组")

    resources = data.get("resources")
    if resources is None:
        errors.append("缺少字段：resources（资源设定）")
    elif not isinstance(resources, list):
        errors.append("resources 必须是数组")

    return errors


def worldview_to_markdown(data: dict[str, Any]) -> str:
    """把结构化世界观 JSON 渲染成可读 Markdown，便于右侧查看与下游上下文阅读。"""
    lines = ["# 世界观", ""]
    lines.append("## 小说类型")
    lines.append(str(data.get("novel_type") or "待补充"))
    lines.append("")
    lines.append("## 世界观基础")
    lines.append(str(data.get("worldview_basis") or "待补充"))
    lines.append("")

    power = data.get("power_system")
    lines.append("## 力量体系")
    if isinstance(power, dict):
        for key, value in power.items():
            if isinstance(value, list):
                lines.append(f"- {key}：{'、'.join(str(v) for v in value)}")
            else:
                lines.append(f"- {key}：{value}")
    else:
        lines.append(str(power or "待补充"))
    lines.append("")

    factions = data.get("factions")
    lines.append("## 势力")
    if isinstance(factions, list) and factions:
        for faction in factions:
            if not isinstance(faction, dict):
                continue
            lines.append(f"### {faction.get('name') or '未命名势力'}")
            lines.append(f"- 地位：{faction.get('status') or '待补充'}")
            lines.append(f"- 位置：{faction.get('location') or '待补充'}")
            chars = faction.get("key_characters")
            if isinstance(chars, list) and chars:
                lines.append("- 关键角色：")
                for char in chars:
                    if isinstance(char, dict):
                        lines.append(f"  - {char.get('name') or '未命名'}｜{char.get('role') or '待补充'}｜{char.get('ability') or '待补充'}")
            lines.append("")
    else:
        lines.append("待补充")
    lines.append("")

    resources = data.get("resources")
    lines.append("## 资源设定")
    if isinstance(resources, list) and resources:
        for res in resources:
            if isinstance(res, dict):
                lines.append(f"- {res.get('name') or '未命名'}：{res.get('description') or '待补充'}")
            else:
                lines.append(f"- {res}")
    else:
        lines.append("待补充")

    return "\n".join(lines).rstrip() + "\n"


def run(task: str, base: Path, data: dict[str, Any]) -> list[str]:
    """工作流引擎入口：生成结构化世界观 JSON 并写入 知识库/世界观.json。

    按当前选择不做过严的字段校验；只保证 LLM 返回的是 JSON 对象即可落盘。
    """
    context = build_context(base)
    worldview = generate_json(
        step_id="generate_worldview_json",
        fields=data,
        context=context,
        json_schema=WORLDVIEW_JSON_SCHEMA,
    )
    if not isinstance(worldview, dict):
        raise ValueError("世界观 JSON 必须是对象")
    output = base / "知识库" / "世界观.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(worldview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown = base / "知识库" / "世界观.md"
    markdown.write_text(worldview_to_markdown(worldview), encoding="utf-8")
    return [str(output.relative_to(base)), str(markdown.relative_to(base))]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成结构化世界观 JSON")
    parser.add_argument("--project", required=True, help="项目目录名，例如 原创-作品名")
    parser.add_argument("--input_mode", choices=["structured", "natural"], default="natural")
    parser.add_argument("--input", default="", help="结构化输入 JSON 字符串")
    parser.add_argument("--natural_input", default="", help="自然语言输入")
    parser.add_argument("--mock", action="store_true", help="不调用 LLM，使用内置示例")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    base = project_dir(args.project)

    if args.mock:
        data = MOCK_WORLDVIEW
    else:
        if args.input_mode == "natural":
            if not args.natural_input.strip():
                print("自然语言输入不能为空", file=sys.stderr)
                return 2
            fields = input_to_fields(
                step_id="generate_worldview_json",
                user_input=args.natural_input,
                input_kind="natural",
                schema_hint={
                    "genre": "题材",
                    "premise": "世界基础",
                    "power_system": "力量体系",
                    "factions": "势力（名称、地位、位置、关键角色、身份、境界/能力）",
                },
                project_hint=args.project,
            )
        else:
            try:
                fields = json.loads(args.input or "{}")
            except json.JSONDecodeError as error:
                print(f"结构化输入不是合法 JSON：{error}", file=sys.stderr)
                return 2
            if not isinstance(fields, dict):
                print("结构化输入必须是 JSON 对象", file=sys.stderr)
                return 2

        context = build_context(base)
        data = generate_json(
            step_id="generate_worldview_json",
            fields=fields,
            context=context,
            json_schema=WORLDVIEW_JSON_SCHEMA,
        )

    if not isinstance(data, dict):
        print("世界观 JSON 必须是对象", file=sys.stderr)
        return 1

    output = base / "知识库" / "世界观.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown = base / "知识库" / "世界观.md"
    markdown.write_text(worldview_to_markdown(data), encoding="utf-8")
    print(output)
    print(markdown)
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
