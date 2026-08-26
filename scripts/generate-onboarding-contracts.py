#!/usr/bin/env python3
"""Author two legal-review masters and generate four entity-specific releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "contracts" / "source"
GENERATED_DIR = ROOT / "contracts" / "generated"
PDF_DIR = ROOT / "output" / "pdf"
ENTITIES_PATH = ROOT / "contracts" / "entities.yml"
MANIFEST_PATH = ROOT / "contracts" / "field-manifests.yml"
AGENT_MASTER = SOURCE_DIR / "Agent_Affiliation_Agreement.docx"
TEAM_LEADER_MASTER = SOURCE_DIR / "Team_Leader_Agreement.docx"

INK, MUTED, LINE, PAPER, BRONZE, GREEN = "1D1C19", "6F6A61", "D8D1C5", "F4F1EA", "98623C", "536B3A"


def load_json_yaml(path: Path) -> dict:
    # JSON is valid YAML 1.2 and avoids a runtime PyYAML dependency.
    return json.loads(path.read_text(encoding="utf-8"))


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths: list[int], indent=120) -> None:
    if sum(widths) != 9360:
        raise ValueError(f"Table widths must total 9360 DXA, got {sum(widths)}")
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
    if tbl_w.getparent() is None:
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), "9360")
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.first_child_found_in("w:tblInd")
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
    if tbl_ind.getparent() is None:
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), str(indent))
    tbl_ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            width = widths[min(index, len(widths) - 1)]
            cell.width = Inches(width / 1440)
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.first_child_found_in("w:tcW")
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
            if tc_w.getparent() is None:
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell)


def set_run_font(run, name="Times New Roman", size=9, bold=False, color=INK, italic=False) -> None:
    run.font.name = name
    fonts = run._element.get_or_add_rPr().rFonts
    fonts.set(qn("w:ascii"), name)
    fonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def add_page_field(paragraph) -> None:
    paragraph.add_run("Page ")
    run = paragraph.add_run()
    nodes = []
    for kind in ("begin", "separate", "end"):
        node = OxmlElement("w:fldChar")
        node.set(qn("w:fldCharType"), kind)
        nodes.append(node)
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run._r.extend([nodes[0], instr, nodes[1], nodes[2]])


def configure_document(doc: Document, running_label: str) -> None:
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin, section.right_margin = Inches(0.82), Inches(1)
    section.bottom_margin, section.left_margin = Inches(0.78), Inches(1)
    section.header_distance = section.footer_distance = Inches(0.36)
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name, normal.font.size = "Times New Roman", Pt(9)
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    normal.paragraph_format.space_before, normal.paragraph_format.space_after = Pt(0), Pt(4)
    normal.paragraph_format.line_spacing = 1.08
    for name, size, before, after, color in (
        ("Title", 22, 0, 6, INK), ("Subtitle", 10, 0, 14, MUTED),
        ("Heading 1", 12.5, 10, 5, INK), ("Heading 2", 10.5, 7, 3, BRONZE),
    ):
        style = styles[name]
        style.font.name, style.font.size = "Arial", Pt(size)
        style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
        style.font.bold = name != "Subtitle"
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before, style.paragraph_format.space_after = Pt(before), Pt(after)
        style.paragraph_format.keep_with_next = True
    style = styles.add_style("Legal Small", WD_STYLE_TYPE.PARAGRAPH)
    style.font.name, style.font.size = "Arial", Pt(7.5)
    style.font.color.rgb = RGBColor.from_string(MUTED)
    style.paragraph_format.space_after, style.paragraph_format.line_spacing = Pt(3), 1.05
    list_style = styles["List Bullet"]
    list_style.font.name, list_style.font.size = "Times New Roman", Pt(9)
    list_style.paragraph_format.left_indent = Inches(0.38)
    list_style.paragraph_format.first_line_indent = Inches(-0.19)
    list_style.paragraph_format.space_after, list_style.paragraph_format.line_spacing = Pt(3), 1.08
    header = section.header.paragraphs[0]
    run = header.add_run(f"HOMIX  |  {running_label}")
    set_run_font(run, "Arial", 7.5, True, MUTED)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    add_page_field(footer)
    for run in footer.runs:
        set_run_font(run, "Arial", 7.5, color=MUTED)


def add_para(doc: Document, text: str, *, bold=False, italic=False, small=False, align=None):
    paragraph = doc.add_paragraph(style="Legal Small" if small else "Normal")
    if align is not None:
        paragraph.alignment = align
    run = paragraph.add_run(text)
    set_run_font(run, "Arial" if small else "Times New Roman", 7.5 if small else 9,
                 bold, MUTED if small else INK, italic)
    return paragraph


def add_heading(doc: Document, text: str, level=1):
    return doc.add_paragraph(text, style=f"Heading {level}")


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        paragraph = doc.add_paragraph(style="List Bullet")
        set_run_font(paragraph.add_run(item))


def add_title_block(doc: Document, title: str, subtitle: str) -> None:
    paragraph = doc.add_paragraph(style="Title")
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(paragraph.add_run(title), "Arial", 22, True)
    paragraph = doc.add_paragraph(style="Subtitle")
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(paragraph.add_run(subtitle), "Arial", 10, color=MUTED)


def add_key_values(doc: Document, items: list[tuple[str, str]]) -> None:
    table = doc.add_table(rows=0, cols=4)
    set_table_geometry(table, [1600, 3080, 1600, 3080])
    for index in range(0, len(items), 2):
        row = table.add_row()
        pair = items[index:index + 2]
        for pair_index in range(2):
            label_cell, value_cell = row.cells[pair_index * 2], row.cells[pair_index * 2 + 1]
            label, value = pair[pair_index] if pair_index < len(pair) else ("", "")
            set_cell_shading(label_cell, PAPER)
            label_cell.vertical_alignment = value_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_run_font(label_cell.paragraphs[0].add_run(label), "Arial", 7.5, True, MUTED)
            set_run_font(value_cell.paragraphs[0].add_run(value), "Arial", 8)


def add_plan_table(doc: Document) -> None:
    rows = [
        ("SOLO", "85% Agent / 15% Company", "$288 / 12 months or $500 / 24 months", "$12,000 annual Company Dollar cap"),
        ("SOLO PRO", "100% commission mode", "$3,650 annual plan fee", "Transaction fee from first closing; no split cap"),
        ("TEAM MEMBER", "90% Agent Side / 10% Company", "$288 / 12 months or $500 / 24 months", "$10,000 Company cap; Team terms separate"),
    ]
    table = doc.add_table(rows=1, cols=4)
    set_table_geometry(table, [1500, 2420, 2560, 2880])
    for cell, text in zip(table.rows[0].cells, ["Plan", "Company economics", "Affiliation fee", "Cap / transaction rule"]):
        set_cell_shading(cell, PAPER)
        set_run_font(cell.paragraphs[0].add_run(text), "Arial", 7.5, True)
    for row_data in rows:
        row = table.add_row()
        for index, value in enumerate(row_data):
            set_run_font(row.cells[index].paragraphs[0].add_run(value), "Arial", 7.5,
                         index == 0, GREEN if index == 0 else INK)


def add_signature_grid(doc: Document, left_label: str, right_label: str) -> None:
    table = doc.add_table(rows=4, cols=2)
    set_table_geometry(table, [4680, 4680])
    values = [
        (left_label, right_label),
        ("Signature: __________________________________", "Signature: __________________________________"),
        ("Printed name: ______________________________", "{{BROKER_NAME}}, {{BROKER_TITLE}}"),
        ("Date: ______________________________________", "Date: ______________________________________"),
    ]
    for row_index, row_values in enumerate(values):
        for col_index, value in enumerate(row_values):
            cell = table.rows[row_index].cells[col_index]
            if row_index == 0:
                set_cell_shading(cell, PAPER)
            set_run_font(cell.paragraphs[0].add_run(value), "Arial", 7.5, row_index == 0)


def add_acknowledgement(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph()
    set_run_font(paragraph.add_run("[  ] "), "Arial", 10, True, GREEN)
    set_run_font(paragraph.add_run(text), "Arial", 8.5, True)


def new_page(doc: Document, title: str, kicker: str) -> None:
    doc.add_page_break()
    paragraph = doc.add_paragraph(kicker.upper())
    paragraph.paragraph_format.space_after = Pt(2)
    set_run_font(paragraph.runs[0], "Arial", 7.5, True, BRONZE)
    add_heading(doc, title)


def build_agent_master(path: Path) -> None:
    doc = Document()
    configure_document(doc, "AGENT AFFILIATION AGREEMENT | {{LEGAL_NAME}}")
    add_title_block(doc, "AGENT AFFILIATION AGREEMENT", "{{LEGAL_NAME}} | Version {{AGENT_VERSION}} | New York")
    add_para(doc, "LEGAL-REVIEW CANDIDATE - NOT FOR PRODUCTION SIGNING", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(doc, "This Agent Affiliation Agreement (Agreement) is entered into by {{LEGAL_NAME}} (Company) and the licensed real estate salesperson or associate broker identified below (Agent). The Company is the only contracting brokerage in this document. The parties intend an independent-contractor relationship subject to New York law, Company supervision, and the terms below.")
    add_key_values(doc, [
        ("Legal company", "{{LEGAL_NAME}}"), ("Company address", "{{ADDRESS}}"),
        ("Agent legal name", "[agent_name]"), ("Portal agent ID", "[agent_id]"),
        ("Login / contact email", "[agent_email]"), ("Phone", "[agent_phone]"),
        ("License number", "[license_number]"), ("Practice", "[practice]"),
        ("Selected plan", "[compensation_plan]"), ("Affiliation term", "[affiliation_term_months] months"),
        ("Sponsor", "[sponsor_name]"), ("Team", "[team_name]"),
    ])
    add_heading(doc, "1. Agreement structure")
    add_bullets(doc, [
        "Page 2 records the locked compensation election and required acknowledgement.",
        "Pages 3-5 contain the Independent Contractor Agreement and execution page.",
        "Pages 6-7 contain confidentiality and non-disclosure terms and execution page.",
        "A company-specific association appendix appears only when required for the selected legal entity.",
    ])
    add_heading(doc, "2. Effective date and prerequisites")
    add_para(doc, "This Agreement is not effective until Agent completes all required fields and signatures, Company countersigns after administrator compliance review, required payment is recorded, and Company approves affiliation. Portal-populated company, plan, Sponsor, Team, and term facts are read-only. A material change requires revalidation and, when applicable, a new agreement or addendum.")
    add_para(doc, "This candidate consolidates the Company's previously reviewed enrollment terms and approved compensation workflow. Company counsel must approve this edition before publication.", small=True)

    new_page(doc, "Compensation election and payment terms", "Page 2 | Required plan acknowledgement")
    add_para(doc, "Selected compensation plan (read-only): [compensation_plan]", bold=True)
    add_plan_table(doc)
    add_para(doc, "Non-Producing is an operating status under Solo, not a fourth plan. Legacy Holding elections are treated as Solo. Team Leader is a role requiring a separate Team Leader Agreement and Solo Pro.", small=True)
    add_heading(doc, "Calculation order", 2)
    add_para(doc, "Each closing is calculated in this order: Gross Commission; approved outside referral or Homix source economics; Company Dollar or applicable 100% mode Transaction Fee; approved Team Economics; agent-funded rebate or approved rebate program; and final settlement. Team Split is a percentage of Agent Side after Company Dollar. Company Cap and Team Cap are separate ledgers.")
    add_heading(doc, "Transaction fee in 100% mode", 2)
    add_key_values(doc, [
        ("Commission check up to $30,000", "$200"), ("$30,000.01 to $100,000", "$500"),
        ("Over $100,000", "$1,000"), ("Cap-crossing closing", "No fee on the same closing"),
    ])
    add_heading(doc, "Sponsor and Team economics", 2)
    add_para(doc, "Sponsor Reward and Team Split are distinct obligations. One person may be both Sponsor and Team Leader and, when qualified, receive both separately. Sponsor Reward is calculated from eligible Company-owned revenue under the current Sponsor program; it does not reduce Agent commission or cap credit. No earnings, closing, lead, or continued program availability is guaranteed.")
    add_acknowledgement(doc, "I reviewed the selected plan, fees, Company Cap, Team terms if applicable, transaction fees, and Sponsor disclosure, and I authorize Portal to freeze these facts for this agreement.")
    add_para(doc, "Agent plan signature: __________________________________    Date: __________________", bold=True)

    new_page(doc, "Independent Contractor Agreement - core duties", "Page 3 | ICA")
    clauses = [
        ("1. Independent contractor relationship", "Agent is an independent contractor and not an employee, partner, franchisee, or joint venturer of Company. Agent controls lawful business activity subject to brokerage supervision, legal requirements, transaction deadlines, and Company policies. Nothing authorizes Agent to bind Company, hold client funds personally, practice law, or make guarantees for Company."),
        ("2. License and brokerage association", "Agent will maintain an active New York real estate license associated with the Company identified here while performing licensed activity for it. Agent will promptly disclose any suspension, complaint, investigation, criminal charge, license change, or event affecting eligibility. Agent may not operate a legal Team with licensees associated with another brokerage."),
        ("3. Supervision and compliance", "Agent will follow Article 12-A, 19 NYCRR Part 175, fair housing and anti-discrimination laws, agency disclosures, advertising rules, Company procedures, and Broker instructions. Agent will submit complete transaction files, cooperate with compliance review, use approved forms, and escalate complaints, escrow issues, cybersecurity incidents, and suspected fraud."),
        ("4. Expenses, taxes, insurance, and benefits", "Unless Company expressly agrees in writing, Agent is responsible for licensing, association and listing-service fees, taxes, insurance, transportation, technology, marketing, assistants, and business expenses. Agent is not eligible for employee wages or benefits. Company may issue tax forms to the legal payee maintained in Portal."),
        ("5. Compensation and offsets", "Compensation is payable only after Company receives cleared funds and approves the transaction file. Company may offset documented amounts owed by Agent, chargebacks, approved client credits, third-party referrals, and authorized charges. Transaction compensation is frozen from the plan, source, Team configuration, Sponsor, and facts effective for that transaction."),
    ]
    for title, text in clauses:
        add_heading(doc, title, 2); add_para(doc, text)

    new_page(doc, "Independent Contractor Agreement - operations", "Page 4 | ICA")
    clauses = [
        ("6. Listings, clients, advertising, and records", "All licensed activity is under Company supervision. Advertising, social media, websites, team branding, and property promotion require accurate brokerage identification and required approval. Agent will protect client information and preserve transaction records in Company systems. Company records, leads, forms, media, software, and training remain Company property unless written policy states otherwise."),
        ("7. Rental transactions", "Agent will not provide legal advice or negotiate legal provisions beyond authorized standardized practice. Any Company-required attorney review acknowledgement must be obtained. No rental commission is payable until Company receives required documents, cleared funds, and verifies policy closing conditions. Agent must promptly remit any commission received directly."),
        ("8. Team participation", "A Team is an internal operating organization of one licensed brokerage, not a separate brokerage or legal entity. Team membership, Team Split, Team-sourced Split, Team Cap, and effective date must be in Portal. Company Dollar is calculated before Team Split. Team changes are prospective and may require a new agreement or addendum."),
        ("9. Term and termination", "Either party may terminate affiliation subject to law and written agreements. Agent must stop representing affiliation, return Company property, relinquish systems, preserve records, and cooperate in orderly handling of pending matters. Earned compensation remains subject to applicable transaction facts, offsets, policies, and agreements."),
        ("10. General terms", "This Agreement, compensation election, NDA, Team terms, written policies, and signed addenda are the entire agreement on these subjects. Amendments require an authorized written process. New York law governs. If a provision is unenforceable, the rest remains effective. Notices may be delivered through Portal, email, personal delivery, or another lawful written method."),
    ]
    for title, text in clauses:
        add_heading(doc, title, 2); add_para(doc, text)

    new_page(doc, "Independent Contractor Agreement - execution", "Page 5 | Required signatures")
    add_para(doc, "By signing, Agent confirms: the legal company below is the sole contracting brokerage; Portal facts were reviewed; no oral statement changes plan, Team, Sponsor, cap, fee, or term; Agent could seek independent legal and tax advice; and Agent will comply with law and Company supervision.")
    add_key_values(doc, [
        ("Contracting company", "{{LEGAL_NAME}}"), ("Company address", "{{ADDRESS}}"),
        ("Agent", "[agent_name]"), ("License", "[license_number]"),
        ("Plan", "[compensation_plan]"), ("Team", "[team_name]"),
    ])
    add_para(doc, "Company countersigns manually only after administrator compliance review. A Broker serving more than one licensed company does not combine those companies into one contracting party.", bold=True)
    add_signature_grid(doc, "AGENT - ICA EXECUTION", "COMPANY - ICA COUNTERSIGNATURE")
    add_para(doc, "Countersigner: {{BROKER_NAME}}, {{BROKER_TITLE}} | {{BROKER_EMAIL}} | {{LEGAL_NAME}}", small=True)

    new_page(doc, "Confidentiality and non-disclosure agreement", "Page 6 | NDA")
    clauses = [
        ("1. Confidential Information", "Confidential Information includes non-public client and prospect data; transaction and financial information; credentials; source code, workflows, prompts, models, software, and platform data; marketing plans; pricing and commission administration; internal training; employee, contractor, and family information; and other reasonably confidential information. It excludes information lawfully public, independently developed, rightfully received without duty, or legally required to be disclosed."),
        ("2. Protection and permitted use", "Agent will use Confidential Information only for authorized Company business; apply reasonable security; not share credentials; not copy, record, screenshot, redistribute, republish, or repackage restricted materials; and promptly report suspected unauthorized access or disclosure. Disclosure to an approved assistant requires Company authorization and equivalent obligations."),
        ("3. Return, deletion, access, and remedies", "On request or termination, Agent will return or securely delete Company information and relinquish accounts and devices as directed, subject to legal retention. Unauthorized use may cause irreparable harm and Company may seek lawful injunctive relief, damages, fees, and other remedies. Prior-package liquidated damages are not carried forward unless counsel expressly approves them in this edition."),
        ("4. Duration and protected disclosures", "Confidentiality survives termination for the period stated by law or policy and, for trade secrets, while protected. Nothing prohibits lawful reporting to government officials or an attorney, participation in an investigation, or disclosure protected by the Defend Trade Secrets Act or other whistleblower law."),
    ]
    for title, text in clauses:
        add_heading(doc, title, 2); add_para(doc, text)

    new_page(doc, "NDA execution and final acknowledgement", "Page 7 | Required signature")
    add_para(doc, "Agent acknowledges the confidentiality terms, understands that Company systems may contain sensitive information, and agrees not to place SSN, full bank-account information, payment-card data, or signing credentials into contract merge fields, ordinary Portal notes, or support messages.")
    add_heading(doc, "Continuing obligations", 2)
    add_bullets(doc, [
        "Protect Company, client, Agent, and vendor information using reasonable safeguards.",
        "Use Company information only for authorized business and comply with retention instructions.",
        "Return access and information promptly on request or termination.",
        "Report suspected loss, unauthorized disclosure, or compromised credentials immediately.",
        "Preserve lawful whistleblower, regulatory, and attorney communications.",
    ])
    add_key_values(doc, [
        ("Owner / Company", "{{LEGAL_NAME}}"), ("Recipient / Agent", "[agent_name]"),
        ("Company address", "{{ADDRESS}}"), ("Agent email", "[agent_email]"),
    ])
    add_para(doc, "Agent NDA signature: __________________________________    Date: __________________", bold=True)
    add_para(doc, "The NDA signature is separate from the ICA execution signature and must be completed independently.", small=True)

    doc.add_paragraph("[[IF_REALTY]]")
    new_page(doc, "LIBOR / OneKey membership appendix", "Page 8 | {{LEGAL_NAME}} only")
    add_para(doc, "This appendix applies only to an Agent affiliating with {{LEGAL_NAME}} and is part of this entity-specific Agreement.", bold=True)
    add_acknowledgement(doc, "I understand that {{LEGAL_NAME}} requires completion and maintenance of applicable LIBOR / OneKey membership and payment of related fees. I will provide accurate information and complete required association or listing-service forms outside this contract.")
    add_key_values(doc, [
        ("Agent legal name", "________________________________"), ("NY license number", "________________________________"),
        ("Home address", "________________________________"), ("Phone", "________________________________"),
        ("Email", "________________________________"), ("Initials", "____________"),
    ])
    add_heading(doc, "Membership and data handling", 2)
    add_para(doc, "Agent is responsible for maintaining eligibility and paying association, listing-service, access, key, education, and other required charges unless Company confirms otherwise in writing. Timing, approval, and third-party fees are controlled by the association or service and are not guaranteed by Company.")
    add_para(doc, "SSN, full bank information, payment-card data, and identity credentials must not be entered here or in ordinary Portal notes. If a third party requires sensitive information, Agent will submit it through that party's authorized secure process or another Company-approved restricted workflow.")
    add_para(doc, "Agent appendix signature: ______________________________    Date: __________________", bold=True)
    add_para(doc, "Agent initials: __________", bold=True)
    doc.add_paragraph("[[END_IF_REALTY]]")
    doc.core_properties.title = "Agent Affiliation Agreement master"
    doc.core_properties.subject = "Homix Agent affiliation master with conditional Realty appendix"
    doc.core_properties.author = "Homix"
    doc.core_properties.comments = "Legal-review candidate. Entity releases must be immutable."
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)


def build_team_leader_master(path: Path) -> None:
    doc = Document()
    configure_document(doc, "TEAM LEADER AGREEMENT | {{LEGAL_NAME}}")
    add_title_block(doc, "TEAM LEADER AGREEMENT", "{{LEGAL_NAME}} | Version {{TEAM_LEADER_VERSION}} | New York")
    add_para(doc, "LEGAL-REVIEW CANDIDATE - NOT FOR PRODUCTION SIGNING", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(doc, "This Team Leader Agreement supplements Team Leader's completed Agent Affiliation Agreement with {{LEGAL_NAME}} and does not create a separate brokerage, employment relationship, partnership, franchise, or authority to bind Company. The Team and every licensed Team Member must be associated with the same licensed brokerage.")
    add_key_values(doc, [
        ("Legal company", "{{LEGAL_NAME}}"), ("Company address", "{{ADDRESS}}"),
        ("Team Leader", "[agent_name]"), ("License number", "[license_number]"),
        ("Team name", "[team_name]"), ("Expected members", "[expected_member_count]"),
        ("Team positioning", "[team_positioning]"), ("Required plan", "[compensation_plan]"),
    ])
    add_heading(doc, "1. Eligibility and appointment")
    add_para(doc, "Appointment requires an Active Agent account, completed onboarding with the same Company, Solo Pro, Company approval of the application, completion of this Agreement, and Company countersignature. Portal records the Team in forming status until activation conditions are complete.")
    add_heading(doc, "2. Legal Team boundary")
    add_para(doc, "Team Leader.companyId, Team.companyId, and every Team Member.companyId must match. The Team may not recruit or hold out a licensee associated with another brokerage as a member. Shared branding may use a non-legal internal team_group with separate entity-specific Teams and agreements.")
    add_heading(doc, "3. Activation")
    add_para(doc, "After this Agreement, Portal may permit entity-locked invitations. The Team becomes Active only after the first approved Team Member completes the applicable Agent Agreement and all Company activation conditions. Company may pause or deny activation for compliance, licensing, payment, or operational reasons.")

    new_page(doc, "Team compensation configuration", "Page 2 | Required acknowledgement")
    add_para(doc, "Team Leader personal-production plan (read-only): [compensation_plan]", bold=True)
    add_key_values(doc, [
        ("Team name", "[team_name]"), ("Terms effective", "[team_terms_effective_from]"),
        ("Standard Team Split", "[team_split_pct]% of Agent Side"),
        ("Team-sourced Split", "[team_sourced_split_pct]% of Agent Side"),
        ("Annual Team Cap", "[team_cap_usd]"), ("Configuration version", "[team_config_version]"),
    ])
    add_heading(doc, "Calculation and versioning", 2)
    add_para(doc, "For Team Members, source economics are calculated first, Company Dollar next, and Team Split from Agent Side. Company Cap and Team Cap are separate ledgers. Sponsor Reward and Team Split are separately calculated and reported even when Team Leader is Sponsor.")
    add_para(doc, "The configuration is effective-dated and prospective. An executed, effective, or transaction-used version may not be edited in place. Changes require a new Portal version, date, audit history, policy validation, and required acceptance or addendum. Team Leader may propose permitted Split and Cap values; Company retains final approval and emergency suspension authority.")
    add_heading(doc, "Recruiting and Sponsor attribution", 2)
    add_para(doc, "A Team recruiting link locks Company, Team, Team Member plan, current configuration, and Sponsor. Sponsor defaults to Team Leader but may be another Active Agent on the same Team who recruited the candidate. A personal referral Sponsor remains separate when the candidate later joins this Team. Team Leader acceptance does not replace final Company approval.")
    add_acknowledgement(doc, "I accept the locked Team configuration, understand that my personal plan is Solo Pro, and understand that Sponsor Reward and Team Split are independent obligations.")
    add_para(doc, "Team Leader initials: __________", bold=True)

    new_page(doc, "Team Leader duties and Company oversight", "Page 3 | Operations and compliance")
    clauses = [
        ("1. Recruiting, onboarding, and supervision", "Team Leader will provide commercially reasonable recruiting support, onboarding guidance, workflow supervision, training, transaction escalation, and coaching consistent with Company policy. Team Leader will not promise affiliation, guaranteed income, guaranteed leads, an unapproved compensation arrangement, or a Sponsor reward outside the Company program."),
        ("2. Compliance and advertising", "Team Leader will support accurate records, transaction-file submission, fair housing, agency disclosure, advertising compliance, cybersecurity, and approved forms and systems. Team names and advertising must identify the brokerage as required by 19 NYCRR 175.25. Only Company and Broker exercise final supervision and approval."),
        ("3. Escalation", "Team Leader will promptly escalate licensing issues, complaints, claims, fair housing concerns, escrow or funds issues, advertising violations, defective files, conflicts, suspected fraud, privacy incidents, and matters requiring brokerage oversight. Team Leader will not provide legal or tax advice unless separately qualified and authorized."),
        ("4. Data access and confidentiality", "Access is limited to information reasonably needed to manage the Team. Team Leader may not access W-9 forms, ACH or bank details, payment-card data, administrator notes, evidence packages, SSN, or restricted personal data except through an authorized role and documented purpose. Confidentiality, security, and retention requirements continue after the role ends."),
        ("5. Broker authority", "Broker retains final authority over licensing sponsorship, compliance, advertising, transactions, Company compensation policy, Team configuration ranges, Team status, access, and discipline. Company may pause recruiting, suspend privileges, require corrective action, or deactivate the Team for compliance, risk, nonpayment, inactivity, policy breach, or protection of clients and Company."),
    ]
    for title, text in clauses:
        add_heading(doc, title, 2); add_para(doc, text)

    new_page(doc, "Term, changes, and execution", "Page 4 | Required signatures")
    add_heading(doc, "1. Team changes and termination", 2)
    add_para(doc, "Membership changes, transfers, Team Leader replacement, merger, closure, and material compensation changes are prospective and require Portal records, Company approval, and any required agreement or addendum. Ending Team Leader role does not itself terminate Agent affiliation. Historical transactions remain governed by frozen facts and versions.")
    add_heading(doc, "2. Entire agreement and governing law", 2)
    add_para(doc, "This Agreement, Agent Affiliation Agreement, locked Team Compensation Configuration, Team Member agreements, written policies, and signed addenda govern the role. No oral statement modifies them. New York law governs. If a provision is unenforceable, the remainder remains effective.")
    add_heading(doc, "3. Final acknowledgement", 2)
    add_para(doc, "Team Leader confirms that the legal Company, required Solo Pro plan, Team configuration, Sponsor rules, activation conditions, role boundaries, data restrictions, and Company oversight were disclosed. Company countersigns manually only after administrator review. Recruiting privileges are not effective until Portal verifies all signatures and Company approval.")
    add_key_values(doc, [
        ("Contracting company", "{{LEGAL_NAME}}"), ("Company address", "{{ADDRESS}}"),
        ("Team Leader", "[agent_name]"), ("Team", "[team_name]"),
    ])
    add_signature_grid(doc, "TEAM LEADER SIGNATURE", "COMPANY COUNTERSIGNATURE")
    add_para(doc, "Countersigner: {{BROKER_NAME}}, {{BROKER_TITLE}} | {{BROKER_EMAIL}} | {{LEGAL_NAME}}", small=True)
    doc.core_properties.title = "Team Leader Agreement master"
    doc.core_properties.subject = "Two-entity Homix Team Leader agreement master"
    doc.core_properties.author = "Homix"
    doc.core_properties.comments = "Legal-review candidate. Team Leader must be Solo Pro and in the Team company."
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)


def body_text(element) -> str:
    return "".join(node.text or "" for node in element.iter() if node.tag == qn("w:t"))


def apply_realty_condition(doc: Document, include: bool) -> None:
    body, children = doc.element.body, list(doc.element.body)
    start = next(i for i, child in enumerate(children) if "[[IF_REALTY]]" in body_text(child))
    end = next(i for i, child in enumerate(children) if "[[END_IF_REALTY]]" in body_text(child))
    if include:
        body.remove(children[end]); body.remove(children[start])
    else:
        for child in children[start:end + 1]:
            body.remove(child)


def iter_paragraphs(parent):
    yield from parent.paragraphs
    for table in parent.tables:
        for row in table.rows:
            for cell in row.cells:
                yield from iter_paragraphs(cell)


def replace_placeholders(doc: Document, replacements: dict[str, str]) -> None:
    containers = [doc]
    for section in doc.sections:
        containers.extend([section.header, section.footer])
    for container in containers:
        for paragraph in iter_paragraphs(container):
            for run in paragraph.runs:
                original = run.text
                updated = original
                for key, value in replacements.items():
                    updated = updated.replace(f"{{{{{key}}}}}", value)
                if updated != original:
                    run.text = updated


def generate_entity_docx(master: Path, destination: Path, entity: dict, is_agent: bool) -> None:
    doc = Document(master)
    if is_agent:
        apply_realty_condition(doc, bool(entity["requires_libor_onekey"]))
    replace_placeholders(doc, {
        "LEGAL_NAME": entity["legal_name"], "ADDRESS": entity["address"],
        "BROKER_NAME": entity["broker_name"], "BROKER_TITLE": entity["broker_title"],
        "BROKER_EMAIL": entity["broker_email"], "AGENT_VERSION": entity["agent_version"],
        "TEAM_LEADER_VERSION": entity["team_leader_version"],
    })
    doc.core_properties.title = f"{entity['legal_name']} {'Agent Affiliation' if is_agent else 'Team Leader'} Agreement"
    doc.core_properties.author = entity["legal_name"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    doc.save(destination)


def convert_to_pdf(docx_path: Path) -> Path:
    office = shutil.which("soffice") or shutil.which("libreoffice")
    if not office:
        raise RuntimeError("LibreOffice is required to generate release-candidate PDFs.")
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    path = PDF_DIR / f"{docx_path.stem}.pdf"
    path.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix="homix-libreoffice-") as profile:
        result = subprocess.run(
            [
                office,
                f"-env:UserInstallation={Path(profile).as_uri()}",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(PDF_DIR),
                str(docx_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    if result.returncode != 0:
        raise RuntimeError(f"LibreOffice conversion failed: {result.stderr or result.stdout}")
    if not path.exists():
        raise RuntimeError(f"LibreOffice did not create {path}")
    return path


def assert_clean_pdf(path: Path, entity: dict, is_agent: bool) -> dict:
    reader = PdfReader(str(path))
    expected = 8 if is_agent and entity["requires_libor_onekey"] else 7 if is_agent else 4
    if len(reader.pages) != expected:
        raise RuntimeError(f"{path.name} has {len(reader.pages)} pages; expected {expected}.")
    if reader.is_encrypted or reader.get_fields():
        raise RuntimeError(f"Encrypted or interactive output: {path}")
    root = reader.trailer["/Root"]
    if root.get("/JavaScript") or root.get("/OpenAction"):
        raise RuntimeError(f"Unexpected document action: {path}")
    for index, page in enumerate(reader.pages, 1):
        if page.get("/Annots"):
            raise RuntimeError(f"Unexpected annotations on {path.name}, page {index}")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    normalized_text = re.sub(r"\s+", " ", text).strip().lower()
    other = "Homix Living Inc." if entity["legal_name"] == "Homix Realty Inc." else "Homix Realty Inc."
    if other.lower() in normalized_text:
        raise RuntimeError(f"{path.name} contains the other contracting entity.")
    if entity["legal_name"].lower() not in normalized_text or entity["address"].lower() not in normalized_text:
        raise RuntimeError(f"{path.name} is missing the selected entity or address.")
    if not entity["requires_libor_onekey"] and any(term in normalized_text for term in ("libor", "onekey", "mls")):
        raise RuntimeError(f"Living release {path.name} contains Realty-only language.")
    return {"file": path.name, "pages": len(reader.pages),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "entity": entity["legal_name"], "agreement": "agent" if is_agent else "team_leader"}


def write_release_index(records: list[dict]) -> None:
    (PDF_DIR / "release-index.json").write_text(json.dumps({"contracts": records}, indent=2) + "\n", encoding="utf-8")
    lines = ["# Homix onboarding contract release candidates", "",
             "Generated from two legal-reviewable DOCX masters and `contracts/entities.yml`.",
             "These files remain candidates until Company counsel approves both masters and the Realty appendix.", "",
             "| File | Entity | Agreement | Pages | SHA-256 |", "| --- | --- | --- | ---: | --- |"]
    for record in records:
        lines.append(f"| `{record['file']}` | {record['entity']} | {record['agreement']} | {record['pages']} | `{record['sha256']}` |")
    lines += ["", "Do not overwrite a published eSign version. Any PDF or field-manifest change requires a new immutable template version, schema hash, Portal pin, and smoke test.", ""]
    (PDF_DIR / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--author-masters", action="store_true")
    args = parser.parse_args()
    if args.author_masters:
        build_agent_master(AGENT_MASTER)
        build_team_leader_master(TEAM_LEADER_MASTER)
    if not AGENT_MASTER.exists() or not TEAM_LEADER_MASTER.exists():
        raise SystemExit("Missing DOCX masters. Run once with --author-masters.")
    if not MANIFEST_PATH.exists():
        raise SystemExit(f"Missing field manifest: {MANIFEST_PATH}")
    records = []
    for entity in load_json_yaml(ENTITIES_PATH).values():
        agent_docx = GENERATED_DIR / f"{entity['agent_filename']}.docx"
        leader_docx = GENERATED_DIR / f"{entity['team_leader_filename']}.docx"
        generate_entity_docx(AGENT_MASTER, agent_docx, entity, True)
        generate_entity_docx(TEAM_LEADER_MASTER, leader_docx, entity, False)
        records.append(assert_clean_pdf(convert_to_pdf(agent_docx), entity, True))
        records.append(assert_clean_pdf(convert_to_pdf(leader_docx), entity, False))
    write_release_index(records)
    for record in records:
        print(f"{record['file']}: {record['pages']} pages {record['sha256']}")


if __name__ == "__main__":
    main()
