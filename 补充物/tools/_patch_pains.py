# -*- coding: utf-8 -*-
"""板块一交付物修订脚本（一次性）：共同点与痛点.docx"""
import copy
import docx
from docx.text.paragraph import Paragraph

PATH = r"a:/yrzk/远程会诊平台/交付物/板块一-需求调研/远程会诊平台-共同点与痛点.docx"

d = docx.Document(PATH)
paras = list(d.paragraphs)


def find_para(text, start=0):
    for i in range(start, len(paras)):
        if paras[i].text.strip().startswith(text):
            return paras[i]
    raise LookupError(text)


def set_text(p, text):
    if not p.runs:
        p.add_run(text)
        return
    p.runs[0].text = text
    for r in p.runs[1:]:
        r._r.getparent().remove(r._r)


def clone_after(anchor_el, src_p, text):
    el = copy.deepcopy(src_p._p)
    p = Paragraph(el, src_p._parent)
    if not p.runs:
        p.add_run(text)
    else:
        p.runs[0].text = text
        for r in p.runs[1:]:
            r._r.getparent().remove(r._r)
    anchor_el.addnext(el)
    return el


# ---------- 1) 数据时效 ----------
head = find_para("基于 2024–2025 官方")
set_text(head, head.text.replace("2024–2025", "2024–2026"))

# ---------- 2) 口径与编号说明 ----------
src = find_para("数据源：")
el = clone_after(src._p, src,
    "口径说明：本清单为行业级调研（公开数据 + 法规文件归纳），用于确立“行业默认答案”；"
    "按干系人整理的访谈级痛点作为下一轮补充，不替代本清单。")
clone_after(el, src,
    "编号约定：痛点统一编号 P1–P7，供《用户故事集》“对应痛点”列与《合规红线清单》交叉核对矩阵反向引用。")

# ---------- 3) 痛点编号 ----------
for n in range(1, 8):
    p = find_para(f"痛点 {n}：")
    set_text(p, p.text.replace(f"痛点 {n}：", f"痛点 P{n}｜", 1))

# ---------- 4) P6 / P7 来源状态 ----------
p6 = find_para("数据：2025 行业调研，32.6%")
clone_after(p6._p, p6,
    "来源状态：⚠️ 本组数据（32.6% / 28.4% / 17.3 小时）为行业抽样汇总，暂未取得可公开引用的原始报告链接。"
    "答辩或立项前须补证；若无法补证，应改为定性表述（“部分县级医院带宽不足、基层缺少专职运维”）。")

p7 = find_para("现状：现有平台大多是整份病历一次性授权")
clone_after(p7._p, p7,
    "来源状态：⚠️ 本条为定性归纳，依据《个人信息保护法》最小必要原则与 GB/T 39725 对去标识化、"
    "场景化授权的要求，暂无可公开引用的量化调研链接；相关法规依据见《合规红线清单》R8。")

d.save(PATH)
print("SAVED:", PATH)
