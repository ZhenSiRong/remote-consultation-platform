# -*- coding: utf-8 -*-
"""板块一交付物修订脚本（一次性）：合规红线清单.docx"""
import copy
import docx
from docx.shared import Pt
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn

PATH = r"a:/yrzk/远程会诊平台/交付物/板块一-需求调研/远程会诊平台-合规红线清单.docx"

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


# ---------- 1) 修正“红线 1、12、16”表述 ----------
p7 = find_para('"机构对机构"是远程会诊的底座')
hit = False
for r in p7.runs:
    if "1、12、16" in r.text:
        r.text = r.text.replace("红线 1、12、16", "红线 1、12")
        hit = True
if not hit:
    set_text(p7, p7.text.replace("（红线 1、12、16）", "（红线 1、12）"))

# ---------- 2) 重排 V1/V2/V3 ----------
p_v1 = find_para("V1 基础版")
p_v2 = find_para("V2 增强版")
p_v3 = find_para("V3 标杆版")

set_text(p_v1, "V1 基础版（先行）：红线 1/2/3/4/5/6/10/16 的流程性拦截与记录归档——机构准入、资质核验、"
               "首诊拦截、知情同意、病历规范、电子签名、处方解耦、超范围拦截，均为“缺失即违规”，必须最先落地；")
set_text(p_v2, "V2 增强版：红线 8/9/12/13 的脱敏、审计留痕、责任协议化与音视频留存——系统性补强数据安全与举证能力；")
set_text(p_v3, "V3 标杆版：红线 14/15 的应急质量体系与网络质量保障。")

# 在 V3 后插入两段说明
el = clone_after(p_v3._p, p_v3,
    "上线闸门（不随版本分期）：红线 7（数据加密与等保三级）、红线 11（数据境内存储与出境管控）属于基础设施门槛，"
    "不按功能版本排期；V1 对外提供服务前必须完成等保三级测评与密评，否则不得上线。")
clone_after(el, p_v3,
    "版本与风险等级一致性说明：红线 7、8、11、16 均为 🔴高 风险项。若把 7、11 放进 V2、16 放进 V3，"
    "会出现“V1 上线即违规”的逻辑漏洞。本版按“准入门槛（闸门）/ 功能版本（V1–V3）/ 标杆增强”三档重排，"
    "确保任一版本对外服务时，高风险红线均已闭环。")

# ---------- 3) 新增 五、交叉核对矩阵 ----------
p_end = find_para("验收提示：每一条红线都应在")
p_head_src = find_para("四、合规建设优先级建议")
p_body_src = find_para("排序铁律（来自课程）")

el = clone_after(p_end._p, p_head_src, "五、红线 ↔ 用户故事 交叉核对矩阵")
el = clone_after(el, p_body_src,
    "核对方法：逐条检查每项红线是否都能落到至少一条可验收的用户故事上；无故事承接的红线，说明其不可验收，"
    "须单列检查方式。故事编号引用《用户故事集》V1.1（全量 22 条）。")

rows_data = [
    ("R1", "机构对机构开展", "US-AV-07、US-COL-04", "✅ 已覆盖"),
    ("R2", "医务人员资质核验", "US-AV-07、US-AV-05", "✅ 已覆盖"),
    ("R3", "首诊红线", "US-AV-07", "✅ 已覆盖"),
    ("R4", "患者知情同意", "US-EMR-05", "✅ 已覆盖"),
    ("R5", "病历书写与保存", "US-REC-01、US-REC-03", "✅ 已覆盖"),
    ("R6", "可靠电子签名", "US-REC-04", "✅ 已覆盖"),
    ("R7", "数据加密与等保三级", "—（系统级）", "⚠️ 无用户故事：由架构与运维保障，列入上线闸门"),
    ("R8", "个人信息最小必要与脱敏", "US-EMR-01、US-EMR-02、US-EMR-05、US-AV-02、US-AV-04", "✅ 已覆盖"),
    ("R9", "全程留痕与审计", "US-EMR-04、US-REC-02、US-REC-06、US-COL-01、US-COL-02、US-COL-03", "✅ 已覆盖"),
    ("R10", "处方红线", "US-REC-01（验收标准含“与处方模块解耦”）", "✅ 已覆盖"),
    ("R11", "数据境内存储与出境管控", "—（系统级）", "⚠️ 无用户故事：由部署架构保障，列入上线闸门"),
    ("R12", "网络安全责任与协议", "US-AV-07、US-COL-04", "✅ 已覆盖"),
    ("R13", "音视频资料留存受控", "US-AV-06、US-REC-06", "✅ 已覆盖"),
    ("R14", "应急与质量管控", "—（系统级）", "⚠️ 无用户故事：由运维预案与质控流程保障"),
    ("R15", "设备与网络质量保障", "US-AV-03", "✅ 已覆盖"),
    ("R16", "禁止超范围诊疗", "US-AV-07", "✅ 已覆盖"),
]

old = d.tables[1]
new = d.add_table(rows=0, cols=4)
new.style = old.style
old_pr = old._tbl.find(qn('w:tblPr'))
new_pr = new._tbl.find(qn('w:tblPr'))
new._tbl.replace(new_pr, copy.deepcopy(old_pr))

widths = [900, 2600, 3200, 2200]
for gc, w in zip(new._tbl.tblGrid.findall(qn('w:gridCol')), widths):
    gc.set(qn('w:w'), str(w))

hr = new.add_row()
for i, txt in enumerate(["红线", "红线条目", "承接的用户故事", "核对状态"]):
    c = hr.cells[i]
    c.width = widths[i]
    r = c.paragraphs[0].add_run(txt)
    r.bold = True
    r.font.size = Pt(9)

for row in rows_data:
    tr = new.add_row()
    for i, txt in enumerate(row):
        c = tr.cells[i]
        c.width = widths[i]
        r = c.paragraphs[0].add_run(txt)
        r.font.size = Pt(9)

el.addnext(new._tbl)

# 表后结论
el2 = clone_after(new._tbl, p_body_src,
    "核对结论：16 条红线中 13 条有可验收的用户故事承接；3 条（R7/R11/R14）属系统级或运维级要求，"
    "不通过用户故事验收，须在“上线验证六查”中单列检查项，不能因“无故事”而默认已满足。")
clone_after(el2, p_body_src,
    "反向核对：US-AV-01（一键组会）、US-EMR-03（时间轴浏览）不直接对应合规条款，由业务价值驱动，属正常；"
    "其余 20 条故事均可在上表找到至少一条红线，或明确标注为“—”并说明理由。")

d.save(PATH)
print("SAVED:", PATH)
