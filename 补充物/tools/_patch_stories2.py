# -*- coding: utf-8 -*-
"""板块一交付物修订脚本（一次性）：用户故事集.docx"""
import copy
import docx
from docx.shared import Pt
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn

PATH = r"a:/yrzk/远程会诊平台/交付物/板块一-需求调研/远程会诊平台-用户故事集.docx"

d = docx.Document(PATH)
paras = list(d.paragraphs)


def find_para(text, start=0):
    for i in range(start, len(paras)):
        if paras[i].text.strip().startswith(text):
            return paras[i]
    raise LookupError(text)


def clone_before(src_p, text, before_p):
    el = copy.deepcopy(src_p._p)
    p = Paragraph(el, src_p._parent)
    if not p.runs:
        p.add_run(text)
    else:
        p.runs[0].text = text
        for r in p.runs[1:]:
            r._r.getparent().remove(r._r)
    before_p._p.addprevious(el)
    return p


def append_text(p, text):
    if not p.runs:
        p.add_run(text)
        return
    r = copy.deepcopy(p.runs[-1]._r)
    p._p.append(r)
    Paragraph(p._p, p._parent).runs[-1].text = text


p_check = find_para("检验标准（来自课程）")
clone_before(p_check,
    "修订：V1.1（2026-10-19）—— 优先级初排补全至全量；新增 US-AV-07（发起会诊合规校验）、"
    "US-REC-06（语音转写与时序绑定）；补齐痛点/红线映射列。",
    find_para("一、干系人（角色）清单"))

i_rec05 = next(i for i, p in enumerate(paras) if p.text.strip().startswith("US-REC-05"))
i_col4 = next(i for i in range(i_rec05, len(paras)) if paras[i].text.strip().startswith("五、模块四"))
src_role_col = find_para("角色：会诊协调员 / 护士")
src_story = find_para("US-AV-01")
src_ac = find_para("验收标准：单场会诊支持邀请")

clone_before(src_role_col, "角色：会诊协调员 / 护士", paras[i_col4])
clone_before(src_story,
    "US-REC-06　作为会诊协调员，我希望会诊过程中的语音讨论、影像标注与文字意见被自动转写并按时间戳绑定，"
    "以便会诊结束后直接生成纪要草稿、减少人工整理。", paras[i_col4])
clone_before(src_ac,
    "验收标准：语音实时转写准确率 ≥ 90%（普通话、安静环境）；每条转写片段、标注帧与文字意见均带统一时间戳，"
    "可在同一条时间轴上联合回放；会诊结束后 1 分钟内生成纪要草稿（讨论要点/结论/待办）；"
    "草稿须经参与医师确认后方可归档，未确认不进入病历；转写文本与音频一并纳入存证，保存期与病历一致。",
    paras[i_col4])

i_av02 = next(i for i, p in enumerate(paras) if p.text.strip().startswith("US-AV-02"))
i_expert = next(i for i in range(i_av02, len(paras)) if paras[i].text.strip().startswith("角色：受邀方专家"))

clone_before(src_story,
    "US-AV-07　作为发起方临床医生，我希望提交会诊申请时系统自动完成机构协议、医师资质、首诊条件与执业科目校验，"
    "以便不合规的会诊在入口处就被拦截。", paras[i_expert])
clone_before(src_ac,
    "验收标准：提交前校验 ①申请机构与受邀机构均已签署《远程医疗服务协议》；②参与医师执业资质在有效期内，"
    "互联网诊疗主诊医师具备 ≥3 年独立临床经验；③患者本次为复诊或已在本机构建立首诊记录，未建立者系统阻断并提示转线下首诊；"
    "④会诊科目在机构获批执业范围内，超范围科目不可选；⑤校验结果与拦截原因写入操作日志，可审计、可导出。",
    paras[i_expert])

append_text(find_para("验收标准：提供标准化模板"),
            "会诊意见与处方模块解耦，不提供由会诊意见一键开方的入口。")

old = d.tables[1]
rows_data = [
    ("🔴 必须做（合规硬性要求，缺失即违规）", "", "", "", "", ""),
    ("", "US-AV-07", "发起方临床医生", "发起会诊时自动校验机构协议、医师资质、首诊与执业科目", "—", "R1/R2/R3/R12/R16"),
    ("", "US-EMR-05", "患者", "知情同意方可调阅，越权访问实时阻断", "P7", "R4/R8"),
    ("", "US-REC-03", "医务科/质控", "会诊记录符合病历书写规范、可质控抽查", "P4", "R5"),
    ("", "US-REC-04", "医务科/质控", "记录经各方可靠电子签名后方可归档", "P4", "R6"),
    ("", "US-COL-04", "信息科管理员", "各方以机构身份接入、协议约束责任", "P4", "R1/R12"),
    ("★ 优先做（高频刚需，决定平台能否真正用起来）", "", "", "", "", ""),
    ("", "US-AV-01", "发起方临床医生", "一键邀请多方专家、自动建立音视频房间", "P3", "—"),
    ("", "US-AV-03", "受邀方专家", "弱网环境下音视频“可听懂、可看清”", "P6", "R15"),
    ("", "US-AV-04", "受邀方专家", "屏幕共享 + DICOM 同步翻页/缩放/标注", "P2", "R8"),
    ("", "US-EMR-01", "发起方临床医生", "按授权调阅门诊/住院/检验/影像", "P1", "R8"),
    ("", "US-REC-01", "发起方临床医生", "自动生成结构化会诊记录", "P2", "R5"),
    ("", "US-REC-06", "会诊协调员", "语音转写 + 标注/意见时序绑定 + 自动纪要草稿", "P2", "R9/R13"),
    ("", "US-COL-02", "多方医生", "共享病历协同标注、实时同步", "P2", "R9"),
    ("🟢 安排做（合规补强与体验完善）", "", "", "", "", ""),
    ("", "US-AV-02", "发起方临床医生", "会诊前预览患者关键信息卡片", "P3", "R8"),
    ("", "US-AV-05", "患者", "会诊前确认参与医师身份与执业资质", "—", "R2"),
    ("", "US-AV-06", "会诊协调员", "会诊全程录制并存证", "P4", "R13"),
    ("", "US-EMR-02", "发起方临床医生", "选定共享病历区间、生成共享快照", "P7", "R8"),
    ("", "US-EMR-03", "受邀方专家", "结构化时间轴浏览、危急值高亮", "P1", "—"),
    ("", "US-EMR-04", "信息科管理员", "调阅与共享全程留痕、不可篡改", "P4", "R9"),
    ("", "US-REC-02", "受邀方专家", "各方意见分区署名、单方可确认/撤回", "P4", "R9"),
    ("", "US-REC-05", "患者", "查阅本人会诊结论摘要（通俗化）", "—", "R8"),
    ("", "US-COL-01", "会诊协调员", "会场角色与发言权限控制", "P2", "R9"),
    ("", "US-COL-03", "医务科/质控", "全流程状态机可视化与异常告警", "P4", "R9"),
    ("💤 暂不做（非本期需求，不建故事）", "", "", "", "", ""),
    ("", "—", "—", "纯体验项：美颜、虚拟背景、个性化主题", "—", "—"),
]

new = d.add_table(rows=0, cols=6)
new.style = old.style
old_pr = old._tbl.find(qn('w:tblPr'))
new_pr = new._tbl.find(qn('w:tblPr'))
new._tbl.replace(new_pr, copy.deepcopy(old_pr))

widths = [1500, 1150, 1400, 2700, 800, 900]
for gc, w in zip(new._tbl.tblGrid.findall(qn('w:gridCol')), widths):
    gc.set(qn('w:w'), str(w))

hdr = ["优先级", "故事编号", "角色", "能力摘要", "对应痛点", "对应红线"]
hr = new.add_row()
for i, txt in enumerate(hdr):
    c = hr.cells[i]
    c.width = widths[i]
    r = c.paragraphs[0].add_run(txt)
    r.bold = True
    r.font.size = Pt(9)

for row in rows_data:
    tr = new.add_row()
    if row[0]:
        merged = tr.cells[0].merge(tr.cells[-1])
        r = merged.paragraphs[0].add_run(row[0])
        r.bold = True
        r.font.size = Pt(9)
        continue
    for i, txt in enumerate(row):
        c = tr.cells[i]
        c.width = widths[i]
        r = c.paragraphs[0].add_run(txt)
        r.font.size = Pt(9)

old._tbl.addprevious(new._tbl)
old._tbl.getparent().remove(old._tbl)

h = find_para("六、需求优先级初排")
h.runs[0].text = "六、需求优先级初排（全量 22 条 · 痛 × 频 × 合规）"

clone_before(find_para("课程铁律（任何项目成立）"),
    "映射说明：①“对应痛点”列引用《共同点与痛点》P1–P7；②“对应红线”列引用《合规红线清单》R1–R16；"
    "③标“—”表示该故事由业务价值驱动、不直接对应合规条款；④原“智能纪要自动生成”已由 US-REC-06 承接，"
    "不再列为暂不做。",
    find_para("七、交付检验清单"))

_chk = next(p for p in paras if "交叉核对" in p.text)
append_text(_chk, "（已建立三向映射矩阵，见《合规红线清单》五、交叉核对矩阵）")

d.save(PATH)
print("SAVED:", PATH)
