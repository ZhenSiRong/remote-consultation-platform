# -*- coding: utf-8 -*-
"""
docx -> md 转换器（面向本项目板块一的交付物）

保留：标题层级、段落、行内加粗/斜体、表格（含表头与合并单元格）、编号列表。
用法：python docx2md.py <dir_or_file> [...]
"""
import re
import sys
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def has_numbering(p):
    pPr = p._p.pPr
    return pPr is not None and pPr.numPr is not None


def runs_to_md(p):
    out = []
    for r in p.runs:
        t = r.text
        if not t:
            continue
        if r.bold and t.strip():
            core = t.strip()
            lead = t[: len(t) - len(t.lstrip())]
            trail = t[len(t.rstrip()):]
            out.append(f'{lead}**{core}**{trail}')
        elif r.italic and t.strip():
            core = t.strip()
            lead = t[: len(t) - len(t.lstrip())]
            trail = t[len(t.rstrip()):]
            out.append(f'{lead}*{core}*{trail}')
        else:
            out.append(t)
    return ''.join(out)


def heading_level(p, is_first):
    t = p.text.strip()
    if is_first:
        return 1
    # 中文序号一律视为二级标题（原文档标题样式不统一，强制归位）
    if re.match(r'^[一二三四五六七八九十]+、', t):
        return 2
    if re.match(r'^角色[：:]', t):
        return 3
    if re.match(r'^US-[A-Z]{2,3}-\d{2}', t):
        return 4
    name = p.style.name or ''
    if name.startswith('Heading'):
        m = re.search(r'(\d+)', name)
        n = int(m.group(1)) if m else 1
        return min(n + 1, 6)  # 文档内 Heading 1 视为二级标题
    runs = [r for r in p.runs if r.text.strip() and r.font.size]
    if runs:
        sizes = {r.font.size for r in runs}
        if len(sizes) == 1:
            pt = sizes.pop().pt
            if pt >= 20:
                return 1
            if pt >= 14:
                return 2
    if re.match(r'^（[一二三四五六七八九十]+）', t):
        return 3
    return 0

def cell_text(cell):
    parts = []
    for p in cell.paragraphs:
        tx = runs_to_md(p).strip()
        if tx:
            parts.append(tx)
    if not parts:
        # 可能嵌套表格
        for tb in cell.tables:
            parts.append(table_to_md(tb))
    return '<br>'.join(parts).replace('|', r'\|')


def table_to_md(tb):
    ncols = len(tb.columns)
    lines = []
    header_done = False
    for row in tb.rows:
        # 按 _tc 分组：同一 tc 连续出现 = 横向合并（gridSpan）
        groups = []
        for c in row.cells:
            if groups and groups[-1][0]._tc is c._tc:
                groups[-1][1] += 1
            else:
                groups.append([c, 1])

        vals = []
        for c, span in groups:
            vals.append(cell_text(c))
            vals.extend([''] * (span - 1))
        vals = (vals + [''] * ncols)[:ncols]

        # 整行合并 → 分组标题行
        if len(groups) == 1 and groups[0][1] >= ncols:
            label = vals[0].replace('**', '')
            vals = [f'**{label}**'] + [''] * (ncols - 1)

        if not header_done:
            vals = [v.replace('**', '') for v in vals]
        lines.append('| ' + ' | '.join(vals) + ' |')
        if not header_done:
            lines.append('|' + '|'.join(['---'] * ncols) + '|')
            header_done = True
    return '\n'.join(lines)


def convert(path: Path) -> str:
    d = docx.Document(str(path))
    blocks = []  # (kind, text)
    first_content = True

    for child in d.element.body.iterchildren():
        tag = child.tag.split('}')[-1]
        if tag == 'p':
            p = Paragraph(child, d)
            raw = p.text.strip()
            if not raw:
                continue
            lvl = heading_level(p, first_content)
            if lvl:
                blocks.append(('h', '#' * lvl + ' ' + re.sub(r'\s+', ' ', raw)))
            elif has_numbering(p):
                md = runs_to_md(p).strip()
                # 整段被加粗且以「标签：」开头时，只加粗标签，避免通篇加粗
                m = re.match(r'^\*\*([^：*]{2,8})[：:](.*)\*\*$', md)
                if m:
                    md = f'**{m.group(1)}**：{m.group(2)}'
                blocks.append(('li', '- ' + md))
            else:
                blocks.append(('p', runs_to_md(p).strip()))
            first_content = False
        elif tag == 'tbl':
            blocks.append(('table', table_to_md(Table(child, d))))
            first_content = False

    chunks = []
    for kind, text in blocks:
        if kind == 'li' and chunks and chunks[-1][0] == 'li':
            chunks[-1][1].append(text)
        else:
            chunks.append((kind, [text]))
    return '\n\n'.join('\n'.join(c[1]) for c in chunks) + '\n'


def main(argv):
    targets = []
    for a in argv:
        p = Path(a)
        if p.is_dir():
            targets.extend(sorted(p.glob('*.docx')))
        elif p.suffix.lower() == '.docx':
            targets.append(p)
    if not targets:
        print('未找到 docx')
        return 1
    for t in targets:
        if t.name.startswith('~$'):
            continue
        md = convert(t)
        out = t.with_suffix('.md')
        out.write_text(md, encoding='utf-8', newline='\n')
        print(f'{t.name}  ->  {out.name}  ({len(md.splitlines())} 行)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
