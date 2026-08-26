#!/usr/bin/env python3
"""Render the versioned Realty LIBOR/OneKey disclosure attachment."""

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "contracts" / "appendices" / "Realty_LIBOR_OneKey_Fee_Disclosures_v1.pdf"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")


def footer(canvas, document) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(HexColor("#6F6A61"))
    canvas.drawString(inch, 0.48 * inch, "HOMIX | REALTY LIBOR / ONEKEY DISCLOSURE | VERSION 1")
    canvas.drawRightString(7.5 * inch, 0.48 * inch, f"Page {document.page}")
    canvas.restoreState()


def main() -> None:
    pdfmetrics.registerFont(TTFont("ArialUnicode", str(FONT_PATH)))
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "CJKBody", parent=styles["BodyText"], fontName="ArialUnicode", fontSize=9,
        leading=13, spaceAfter=7, textColor=HexColor("#1D1C19"), alignment=TA_LEFT,
    )
    heading = ParagraphStyle(
        "CJKHeading", parent=body, fontName="ArialUnicode", fontSize=13,
        leading=17, spaceBefore=5, spaceAfter=8, textColor=HexColor("#98623C"),
    )
    title = ParagraphStyle(
        "CJKTitle", parent=body, fontName="ArialUnicode", fontSize=18,
        leading=22, spaceAfter=14, textColor=HexColor("#1D1C19"),
    )
    small = ParagraphStyle(
        "CJKSmall", parent=body, fontName="ArialUnicode", fontSize=7.8,
        leading=11, textColor=HexColor("#6F6A61"),
    )
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=LETTER, rightMargin=inch, leftMargin=inch,
        topMargin=0.72 * inch, bottomMargin=0.72 * inch,
        title="Realty LIBOR and OneKey Fee Disclosures v1",
        author="Homix Realty Inc.",
    )
    story = [
        Paragraph("MLS（LIBOR 与 OneKey MLS）收费标准", title),
        Paragraph("LIBOR 年费周期为每年的 10 月 1 日至第二年的 9 月 30 日，通常经纪人会在每年的 9 月收到新一年的年费账单。", body),
        Paragraph("OneKey MLS 的年费周期为每年的 1 月 1 日至 12 月 31 日，通常经纪人会在每年的 11 月收到新一年的年费账单。", body),
        Paragraph("MLSLI 和 Hudson Gateway MLS 的合并于 2020 年 3 月 24 日完成。原始入职文件说明所有新成员的初始启动费用为 200 美元；实际金额、激活规则和所有第三方费用以 LIBOR、OneKey MLS 及相关机构当期正式账单和规则为准。", body),
        Paragraph("每年 1 月至 9 月被激活的账户，LIBOR 通常会收取激活当月至当年年底的费用。每年 10 月至 12 月被激活的账户，LIBOR 通常会收取当年剩余费用以及第二年一整年的费用。所有费用通常不可退还。更多资讯请查看 LIBOR 官方网站和当期正式通知。", body),
        Paragraph("常见问题", heading),
        Paragraph("<b>MLS 何时要求续费？</b><br/>原始入职文件说明，每年 9 月为 LIBOR 续费月，每年 11 月为 OneKey MLS 续费月。经纪人应在收到正式账单后按账单期限支付下一周期费用。如果不愿续费，应提前告知公司；公司将依照适用规则处理执照挂靠和 MLS 账户状态。", body),
        Paragraph("<b>如果我离开 Homix，转去其他公司，是不是就可以不付 MLS 费用了？</b><br/>不可以。已经产生的会员、激活或使用费用仍需按相关机构账单结清。新的经纪公司也可能要求加入其辖区内适用的 REALTOR 协会或 MLS，并承担相应费用。", body),
        Paragraph("<b>既然挂靠公司都需要付 MLS 费用，那我不挂靠任何公司可以吗？</b><br/>不可以。纽约州持牌经纪人必须依法由合资格经纪公司挂靠，未处于有效挂靠状态时不得从事需要执照的房地产经纪活动。", body),
        Paragraph("<b>假如我没有按原续费月付款，之后再续缴，会少缴些会费吗？</b><br/>通常不会。费用按账户激活日、正式账单周期和第三方机构当期规则计算。", body),
        PageBreak(),
        Paragraph("MLS（LIBOR 与 OneKey MLS）常见问题（续）", title),
        Paragraph("<b>假如我加入公司后晚几个月才开始做业务，延后付款是否会少缴费用？</b><br/>通常不会。原始入职文件说明，MLS 费用从账户激活日开始计算；最终以第三方机构的当期账单为准。", body),
        Paragraph("<b>假如我在账单到期日前离开公司、退出 LIBOR，是不是就不用付费？</b><br/>不一定。LIBOR 可能根据账户激活日至退出日重新结算，已经发生的费用仍需支付。", body),
        Paragraph("<b>我在邮件中收到了 LIBOR 的账单，该如何付款？</b><br/>1. 网上付款：根据正式邮件中的指示，使用自己的账户登录 LIBOR 或 OneKey MLS 官方付款渠道。<br/>2. 官方客服付款：使用账单或 LIBOR 官方网站公布的联系方式，按照其安全流程直接完成付款。", body),
        Paragraph("不要向 Homix 提交完整银行卡号、CVV、银行卡复印件或第三方账户密码。", small),
        Paragraph("<b>如果我对账单有疑问，该如何联系 LIBOR Membership？</b><br/>请使用账单或 LIBOR 官方网站公布的 Membership Services 电话和邮箱。原始入职文件列出的联系方式为 631-661-4800 转 5 和 libormem@lirealtor.com；使用前应以当期官方信息为准。", body),
        Paragraph("付款确认", heading),
        Paragraph("本人明白并同意在收到 LIBOR 或 OneKey MLS 账单后，按照账单规定的期限通过第三方官方渠道支付所有应付费用。如公司为避免账户停用而根据可核实账单代付已到期费用，本人同意公司可依据本协议和适用法律，从应付佣金中扣回实际代付净额，并在 Portal 中保存账单、代付和扣回记录。", body),
        Paragraph("I understand and agree to pay all LIBOR or OneKey MLS dues by the deadline stated on the applicable invoice through an authorized third-party payment channel. If the Company pays a verified, past-due amount to prevent account suspension, I authorize the Company, subject to this Agreement and applicable law, to recover the actual net amount from commissions otherwise payable to me and to retain an audit record in Portal.", body),
        Spacer(1, 6),
        Paragraph("Agent initials: ____________________", body),
        Paragraph("Agent signature: ____________________________________&nbsp;&nbsp;&nbsp;&nbsp;Date: __________________", body),
        Paragraph("Company countersignature: ___________________________&nbsp;&nbsp;&nbsp;&nbsp;Date: __________________", body),
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
