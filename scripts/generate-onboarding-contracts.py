#!/usr/bin/env python3
"""Build production-candidate Homix onboarding agreements from reviewed packages."""

from __future__ import annotations

import argparse
import io
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


INK = colors.HexColor("#1D1C19")
MUTED = colors.HexColor("#6F6A61")
LINE = colors.HexColor("#D8D1C5")
PAPER = colors.HexColor("#F7F3EC")
BRONZE = colors.HexColor("#9C623B")
GREEN = colors.HexColor("#536B3A")

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs" / "generated"

ENTITIES = {
    "realty": {
        "name": "Homix Realty Inc.",
        "address": "37-20 Prince St, STE 3H, Flushing, NY 11354",
        "agent_filename": "Homix_Realty_Agent_Affiliation_Agreement_v3.1.pdf",
        "leader_filename": "Homix_Realty_Team_Leader_Agreement_v1.0.pdf",
        "keep_source_pages": range(1, 20),  # Drop old plan page, card form, and fee receipt.
        "address_patch_page": None,
        "signatory_patch_page": 19,
    },
    "living": {
        "name": "Homix Living Inc.",
        "address": "110 Charlton St #A, New York, NY 10014",
        "agent_filename": "Homix_Living_Agent_Affiliation_Agreement_v3.1.pdf",
        "leader_filename": "Homix_Living_Team_Leader_Agreement_v1.0.pdf",
        "keep_source_pages": range(1, 18),  # Drop old plan page, card form, and fee receipt.
        "address_patch_page": 3,
        "signatory_patch_page": 17,
    },
}


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ContractTitle",
            parent=base["Title"],
            fontName="Times-Roman",
            fontSize=22,
            leading=25,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=9,
        ),
        "subtitle": ParagraphStyle(
            "ContractSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=16,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Times-Bold",
            fontSize=15,
            leading=18,
            textColor=INK,
            spaceBefore=8,
            spaceAfter=7,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=INK,
            spaceBefore=7,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=9.2,
            leading=12.3,
            textColor=INK,
            spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.6,
            leading=10,
            textColor=MUTED,
            spaceAfter=3,
        ),
        "card_title": ParagraphStyle(
            "CardTitle",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=INK,
            spaceAfter=4,
        ),
        "card_body": ParagraphStyle(
            "CardBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=INK,
        ),
        "label": ParagraphStyle(
            "Label",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.2,
            leading=9,
            textColor=MUTED,
        ),
        "value": ParagraphStyle(
            "Value",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=10,
            textColor=INK,
        ),
    }


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def contract_header_footer(canv: canvas.Canvas, doc, entity_name: str, version: str):
    canv.saveState()
    width, height = letter
    canv.setFillColor(INK)
    canv.setFont("Times-Roman", 19)
    canv.drawString(doc.leftMargin, height - 0.43 * inch, "HOMIX")
    canv.setFillColor(BRONZE)
    canv.rect(doc.leftMargin, height - 0.49 * inch, 0.68 * inch, 1.2, fill=1, stroke=0)
    canv.setFillColor(MUTED)
    canv.setFont("Helvetica", 6.8)
    canv.drawRightString(width - doc.rightMargin, height - 0.39 * inch, entity_name.upper())
    canv.setStrokeColor(LINE)
    canv.line(doc.leftMargin, 0.48 * inch, width - doc.rightMargin, 0.48 * inch)
    canv.setFillColor(MUTED)
    canv.setFont("Helvetica", 6.5)
    canv.drawString(doc.leftMargin, 0.29 * inch, version)
    canv.drawRightString(width - doc.rightMargin, 0.29 * inch, f"Page {doc.page}")
    canv.restoreState()


def info_table(rows: list[tuple[str, str]], st) -> Table:
    data = []
    for index in range(0, len(rows), 2):
        pair = rows[index : index + 2]
        row = []
        for label, value in pair:
            row.extend([p(label, st["label"]), p(value, st["value"])])
        if len(pair) == 1:
            row.extend(["", ""])
        data.append(row)
    table = Table(data, colWidths=[0.9 * inch, 1.72 * inch, 0.9 * inch, 1.72 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def plan_card(title: str, headline: str, details: str, st, accent=BRONZE):
    table = Table(
        [[p(title, st["card_title"])], [p(headline, st["body"])], [p(details, st["card_body"]) ]],
        colWidths=[2.19 * inch],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.8, accent),
                ("LINEABOVE", (0, 0), (-1, 0), 4, accent),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def signature_table(st) -> Table:
    data = [
        [p("AGENT / TEAM LEADER SIGNATURE", st["label"]), p("COMPANY COUNTERSIGNATURE", st["label"])],
        [p("Signature: __________________________________", st["value"]), p("Signature: __________________________________", st["value"])],
        [p("Printed name: ______________________________", st["value"]), p("Si Zhang, Broker", st["value"])],
        [p("Date: ______________________________________", st["value"]), p("Date: ______________________________________", st["value"])],
    ]
    table = Table(data, colWidths=[3.35 * inch, 3.35 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("BACKGROUND", (0, 0), (-1, 0), PAPER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def build_agent_schedule(entity: dict, destination: Path):
    st = styles()
    doc = SimpleDocTemplate(
        str(destination),
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.62 * inch,
    )
    story = [
        p("AGENT AFFILIATION AND COMPENSATION ELECTION", st["title"]),
        p(
            f"{entity['name']} | Compensation Policy v3.1 | New York",
            st["subtitle"],
        ),
        p(
            "This Compensation Election is incorporated into the accompanying Independent Contractor Agreement and replaces any earlier commission-plan page in the enrollment package. Portal-populated values are read-only. The executed agreement, approved team terms, transaction facts, brokerage policy, and applicable law control.",
            st["body"],
        ),
        Spacer(1, 5),
        info_table(
            [
                ("Agent legal name", "[agent_name]"),
                ("Portal agent ID", "[agent_id]"),
                ("Agent email", "[agent_email]"),
                ("Agent phone", "[agent_phone]"),
                ("License number", "[license_number]"),
                ("Licensed company", "[licensed_company]"),
                ("Selected plan", "[compensation_plan]"),
                ("Agent-side split", "[split_pct]%"),
                ("Sponsor", "[sponsor_name]"),
                ("Affiliation term", "[affiliation_term_months] months"),
            ],
            st,
        ),
        Spacer(1, 8),
        p("1. AVAILABLE COMPENSATION PLANS", st["h1"]),
        Table(
            [[
                plan_card(
                    "SOLO",
                    "85% Agent / 15% Homix before the annual Homix cap.",
                    "Affiliation fee: $288 for 12 months or $500 prepaid for 24 months. Annual Homix Company Dollar Cap: $12,000. After the cap, the percentage split stops for the balance of the anniversary year and the Transaction Fee schedule begins on the next closing.",
                    st,
                ),
                plan_card(
                    "SOLO PRO",
                    "100% commission mode from the first closing.",
                    "Annual fee: $3,650, including the base affiliation fee. No percentage split or split cap. The Transaction Fee schedule applies from the first closing. The Solo Pro term is 12 months.",
                    st,
                    accent=INK,
                ),
                plan_card(
                    "TEAM MEMBER",
                    "90% Agent Side / 10% Homix before the annual Homix cap.",
                    "Affiliation fee: $288 for 12 months or $500 prepaid for 24 months. Annual Homix Company Dollar Cap: $10,000. Approved Team Split and Team Cap terms apply separately to the Agent Side and continue after the Homix cap unless the signed Team Agreement states otherwise.",
                    st,
                    accent=GREEN,
                ),
            ]],
            colWidths=[2.24 * inch] * 3,
            hAlign="CENTER",
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]),
        ),
        Spacer(1, 7),
        p(
            "Non-Producing status. An approved agent who is not currently producing remains on the Solo affiliation plan. Non-Producing is a business status, not a separate compensation plan. Permitted activity remains subject to the Agreement, brokerage policy, licensing requirements, and New York law.",
            st["small"],
        ),
        p("2. CALCULATION ORDER AND TRANSACTION FEES", st["h1"]),
        p(
            "Each closing is calculated in this order: Gross Commission; applicable outside referral or Homix source economics; Homix Company Dollar or the 100% mode Transaction Fee; approved Team Economics when applicable; agent-funded rebate or an approved rebate program; and final settlement. A closing that creates normal Homix Company Dollar is not also charged a Transaction Fee.",
            st["body"],
        ),
        Table(
            [
                [p("Commission check received by Homix", st["label"]), p("Transaction Fee in 100% mode", st["label"])],
                [p("Up to $30,000", st["value"]), p("$200", st["value"])],
                [p("$30,000.01 to $100,000", st["value"]), p("$500", st["value"])],
                [p("Over $100,000", st["value"]), p("$1,000", st["value"])],
            ],
            colWidths=[3.35 * inch, 3.35 * inch],
            style=TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                    ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                    ("BACKGROUND", (0, 0), (-1, 0), PAPER),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            ),
        ),
        PageBreak(),
        p("3. SOURCE ECONOMICS", st["h1"]),
        p(
            "Self-generated business has no source fee. A Homix Rental Lead is subject to a 15% Homix Lead Fee and a Homix Sales Lead is subject to a 25% Homix Lead Fee, each taken before the selected plan economics. An outside referral is paid according to the signed referral agreement before plan economics. A team-generated lead follows the signed Team Agreement and is not automatically a Homix lead.",
            st["body"],
        ),
        p("4. TEAM TERMS - COMPLETED ONLY FOR TEAM MEMBER", st["h1"]),
        info_table(
            [
                ("Team name", "[team_name]"),
                ("Standard Team Split", "[team_split_pct]% of Agent Side"),
                ("Team-sourced Split", "[team_sourced_split_pct]% of Agent Side"),
                ("Annual Team Cap", "[team_cap_usd]"),
                ("Team terms effective", "[team_terms_effective_from]"),
            ],
            st,
        ),
        Spacer(1, 7),
        p(
            "Company Dollar is calculated before Team Economics. The Team Split is calculated from the Agent Side after Homix Company Dollar. The Homix Company Cap and Team Cap are separate ledgers. The Team terms shown above are the approved, versioned terms locked by Portal for this enrollment; they may not be changed in the signing session.",
            st["body"],
        ),
        p("5. SPONSOR AND PROGRAM DISCLOSURES", st["h1"]),
        p(
            "Sponsor and Team Leader are separate roles, although one person may serve as both. A Sponsor reward, when qualified, is paid from eligible Homix-owned revenue and does not reduce the introduced agent's commission or cap credit. Transaction fees, outside referral pass-throughs, client rebates or credits, and third-party charges are excluded. Sponsor eligibility and any continued reward remain subject to the signed sponsor program, annual qualification, active status, good standing, and program availability; no reward, lead, closing, or earnings level is guaranteed.",
            st["body"],
        ),
        p("6. FEES, TERM, AND PLAN CHANGES", st["h1"]),
        p(
            "Affiliation and annual fees are due through Portal when this Agreement is signed or renewed, unless the Company records verified offline payment. Fees are non-refundable except where required by law. A 24-month Solo or Team Member election is prepaid. A Solo Pro upgrade within 90 days after an eligible $288 or $500 payment may receive a credit equal to that payment; after 90 days no credit applies. The upgrade begins a new 12-month Solo Pro term. There is no cash refund or monthly proration. Plan changes and team changes are prospective and require Company approval, updated Portal records, and any required new agreement or addendum.",
            st["body"],
        ),
        p("7. ACKNOWLEDGMENT AND COUNTERSIGNATURE", st["h1"]),
        p(
            "The Agent confirms that the selected plan, term, company, sponsor, and any Team terms above were disclosed before signing; that no oral statement changes these written terms; and that this election is subject to the accompanying Independent Contractor Agreement. The Company countersigns only after administrator compliance review. This Compensation Election becomes effective only when all required signatures are complete and the Company approves affiliation.",
            st["body"],
        ),
        Spacer(1, 10),
        signature_table(st),
        Spacer(1, 8),
        p(
            f"Company countersigner: Si Zhang, Broker | sunnyz@homixny.com | {entity['name']}",
            st["small"],
        ),
    ]
    doc.build(
        story,
        onFirstPage=lambda c, d: contract_header_footer(c, d, entity["name"], "Agent Affiliation Agreement - Compensation Policy v3.1"),
        onLaterPages=lambda c, d: contract_header_footer(c, d, entity["name"], "Agent Affiliation Agreement - Compensation Policy v3.1"),
    )


def overlay_patch(address: str | None = None, signatory: bool = False):
    stream = io.BytesIO()
    c = canvas.Canvas(stream, pagesize=letter)
    if address:
        c.setFillColor(colors.white)
        c.rect(165, 538, 260, 18, fill=1, stroke=0)
        c.setFillColor(colors.black)
        c.setFont("Times-Roman", 10)
        c.drawString(169, 542, address)
    if signatory:
        c.setFillColor(colors.white)
        c.rect(450, 284, 45, 17, fill=1, stroke=0)
        c.setFillColor(colors.black)
        c.setFont("Times-Roman", 9.5)
        c.drawString(454, 288, "Broker,")
    c.save()
    stream.seek(0)
    return PdfReader(stream).pages[0]


def clean_source_page(page):
    page.pop(NameObject("/Annots"), None)
    page.pop(NameObject("/AA"), None)
    return page


def combine_agent_package(source_pdf: Path, schedule_pdf: Path, entity: dict, output_pdf: Path):
    source = PdfReader(str(source_pdf))
    schedule = PdfReader(str(schedule_pdf))
    writer = PdfWriter()
    for page in schedule.pages:
        writer.add_page(clean_source_page(page))
    for index in entity["keep_source_pages"]:
        page = clean_source_page(source.pages[index])
        if entity["address_patch_page"] == index:
            page.merge_page(overlay_patch(address=entity["address"]))
        if entity["signatory_patch_page"] == index:
            page.merge_page(overlay_patch(signatory=True))
        writer.add_page(page)
    writer.metadata = {
        "/Title": f"{entity['name']} Agent Affiliation Agreement v3.1",
        "/Author": entity["name"],
        "/Subject": "Agent onboarding, compensation election, independent contractor agreement, and confidentiality terms",
    }
    with output_pdf.open("wb") as handle:
        writer.write(handle)


def build_team_leader_agreement(entity: dict, destination: Path):
    st = styles()
    doc = SimpleDocTemplate(
        str(destination),
        pagesize=letter,
        rightMargin=0.62 * inch,
        leftMargin=0.62 * inch,
        topMargin=0.74 * inch,
        bottomMargin=0.64 * inch,
    )
    story = [
        p("TEAM LEADER AGREEMENT", st["title"]),
        p(f"{entity['name']} | Version 1.0 | New York", st["subtitle"]),
        p(
            "This Team Leader Agreement (\"Agreement\") is entered into by the licensed real estate brokerage identified below (\"Company\") and the licensed agent identified below (\"Team Leader\"). It supplements, and does not replace, the Team Leader's Independent Contractor Agreement and Solo Pro compensation election. If terms conflict, applicable law and the Independent Contractor Agreement control unless this Agreement expressly states otherwise.",
            st["body"],
        ),
        info_table(
            [
                ("Team Leader", "[agent_name]"),
                ("Portal agent ID", "[agent_id]"),
                ("Email", "[agent_email]"),
                ("Phone", "[agent_phone]"),
                ("License number", "[license_number]"),
                ("Licensed company", "[licensed_company]"),
                ("Compensation plan", "[compensation_plan]"),
                ("Team name", "[team_name]"),
                ("Expected members", "[expected_member_count]"),
                ("Team positioning", "[team_positioning]"),
            ],
            st,
        ),
        p("1. APPOINTMENT AND ACTIVATION", st["h1"]),
        p(
            "The Company approves formation of the named Team subject to this Agreement, Company countersignature, applicable licensing and compliance review, and completion of the Portal onboarding lifecycle. The Team initially remains in forming status. The Team Leader may create team recruiting invitations only after Portal verifies completion of this Agreement. The Team becomes active after the first approved Team Member completes the required Team Member agreement and all Company activation conditions are satisfied.",
            st["body"],
        ),
        p(
            "The Team is an internal business organization of the Company, not a separate brokerage, employer, partnership, franchise, or legal entity. The Team Leader has no authority to bind the Company, alter brokerage agreements, receive client funds personally, sponsor a license independently, or make guarantees on behalf of the Company.",
            st["body"],
        ),
        p("2. TEAM COMPENSATION CONFIGURATION", st["h1"]),
        info_table(
            [
                ("Standard Team Split", "[team_split_pct]% of Agent Side"),
                ("Team-sourced Split", "[team_sourced_split_pct]% of Agent Side"),
                ("Annual Team Cap", "[team_cap_usd]"),
                ("Effective from", "[team_terms_effective_from]"),
            ],
            st,
        ),
        Spacer(1, 7),
        p(
            "For Team Members, applicable source economics are calculated first, followed by Homix Company Dollar under the Team Member plan. The Team Split is then calculated from the Agent Side. Homix Company Cap and Team Cap are separate ledgers. The Team Leader's personal-production plan is Solo Pro unless the Company approves and documents another plan. Team Split allocations and qualified Sponsor rewards are separate financial obligations and remain separately identified even when the Team Leader is also the Sponsor.",
            st["body"],
        ),
        p(
            "The configuration above is versioned and applies prospectively from its effective date. It may not be changed retroactively or overridden for a single transaction by email, message, spreadsheet, or oral instruction. Any future change requires a new approved configuration version, an effective date, Portal audit history, and any required Team Member acceptance or addendum.",
            st["body"],
        ),
        PageBreak(),
        p("3. TEAM LEADER RESPONSIBILITIES", st["h1"]),
        p(
            "The Team Leader will provide commercially reasonable recruiting support, onboarding guidance, training, supervision of team workflow, transaction escalation, and performance coaching consistent with Company policy. The Team Leader will promote accurate records, timely submission of transaction documents, fair housing compliance, advertising compliance, confidentiality, cybersecurity, and use of Company-approved forms and systems.",
            st["body"],
        ),
        p(
            "The Team Leader will promptly escalate to the Broker or designated administrator any licensing issue, complaint, demand, threatened claim, fair housing concern, escrow or funds issue, advertising violation, missing or defective transaction document, conflict of interest, suspected fraud, privacy incident, or other matter requiring brokerage oversight. The Team Leader will not provide legal or tax advice unless separately licensed to do so.",
            st["body"],
        ),
        p("4. RECRUITING, SPONSOR, AND TEAM MEMBERSHIP", st["h1"]),
        p(
            "A team recruiting invitation fixes the target Team and applicable configuration version. The Sponsor defaults to the Team Leader but may be another Active Agent on the same Team when that person actually completed the recruiting work. A personal referral may retain a Sponsor who is not the Team Leader. Sponsor attribution must not be changed silently and is subject to Portal audit, Company correction rules, and the signed Sponsor program.",
            st["body"],
        ),
        p(
            "The Team Leader may review and accept a candidate's request to join the Team, but only the Company may approve affiliation, licensing sponsorship, compliance status, and final account activation. The Team Leader may not promise approval, guaranteed leads, guaranteed income, a commission arrangement different from the locked Portal terms, or a Sponsor reward outside the Company program.",
            st["body"],
        ),
        p("5. RECORDS, CONFIDENTIALITY, AND DATA ACCESS", st["h1"]),
        p(
            "The Team Leader will use Company systems for invitations, Team terms, onboarding status, transaction records, and compensation records. Access is limited to information reasonably needed to manage the Team. The Team Leader may not access or request Team Member W-9 forms, ACH details, payment-card data, Company internal notes, legal evidence packages, or other restricted data except when expressly authorized for a documented business purpose.",
            st["body"],
        ),
        p(
            "All Company and Team confidential information remains subject to the Team Leader's Independent Contractor Agreement, non-disclosure obligations, privacy policy, security requirements, and applicable law. Upon request or termination, the Team Leader will return or delete Company records and relinquish Company-system access as directed.",
            st["body"],
        ),
        p("6. COMPANY OVERSIGHT", st["h1"]),
        p(
            "The Broker retains final authority over brokerage operations, licensing sponsorship, legal compliance, advertising, transaction supervision, Company compensation policy, permitted Team configuration ranges, Team status, and access to Company systems. The Company may pause recruiting, suspend Team privileges, require corrective action, or deactivate the Team when reasonably necessary for compliance, risk management, nonpayment, inactivity, material policy breach, or protection of clients and the Company.",
            st["body"],
        ),
        PageBreak(),
        p("7. TEAM CHANGES, TRANSFERS, AND TERMINATION", st["h1"]),
        p(
            "Team membership changes are prospective and require accurate Portal records. A Team Member transfer, Team Leader replacement, Team merger, Team closure, or material compensation change may require Company approval and a new agreement or addendum. Historical transactions and completed compensation snapshots remain governed by the terms frozen for those transactions.",
            st["body"],
        ),
        p(
            "Either party may end the Team Leader role subject to the Independent Contractor Agreement and Company policy. Ending the Team Leader role does not by itself terminate the Team Leader's affiliation as an independent contractor. The Company determines the orderly disposition of open invitations, pending candidates, active Team Members, Team records, Company-controlled leads, and unfinished transactions. Accrued compensation remains subject to the applicable signed agreements, transaction facts, offsets, and law.",
            st["body"],
        ),
        p("8. INDEPENDENT CONTRACTOR STATUS", st["h1"]),
        p(
            "The Team Leader remains an independent contractor and is responsible for taxes, licensing expenses, insurance, business expenses, and conduct as provided in the Independent Contractor Agreement. Nothing in this Agreement creates employment, a partnership, a joint venture, a franchise, or authority to act as a broker independent of the Company.",
            st["body"],
        ),
        p("9. ENTIRE TEAM LEADER AGREEMENT; GOVERNING LAW", st["h1"]),
        p(
            "This Agreement, the Independent Contractor Agreement, the locked Team Compensation Configuration, applicable Team Member agreements, and Company policies constitute the written terms governing the Team Leader role. No amendment or waiver is binding unless documented in writing through an authorized Company process. If a provision is unenforceable, the remaining provisions remain effective. New York law governs this Agreement.",
            st["body"],
        ),
        p("10. ACKNOWLEDGMENT AND COUNTERSIGNATURE", st["h1"]),
        p(
            "The Team Leader confirms that the Team configuration, role boundaries, Sponsor rules, activation conditions, and Company oversight described above were disclosed before signing. The Company countersigns only after administrator review. The Team Leader role and recruiting privileges do not become effective until Portal verifies all required signatures and the Company approves activation.",
            st["body"],
        ),
        Spacer(1, 12),
        signature_table(st),
        Spacer(1, 8),
        p(
            f"Company countersigner: Si Zhang, Broker | sunnyz@homixny.com | {entity['name']}",
            st["small"],
        ),
    ]
    doc.build(
        story,
        onFirstPage=lambda c, d: contract_header_footer(c, d, entity["name"], "Team Leader Agreement - Version 1.0"),
        onLaterPages=lambda c, d: contract_header_footer(c, d, entity["name"], "Team Leader Agreement - Version 1.0"),
    )


def assert_clean_pdf(path: Path):
    reader = PdfReader(str(path))
    if reader.is_encrypted:
        raise RuntimeError(f"Encrypted output: {path}")
    if reader.get_fields():
        raise RuntimeError(f"Unexpected AcroForm fields remain: {path}")
    if reader.trailer["/Root"].get("/JavaScript") or reader.trailer["/Root"].get("/OpenAction"):
        raise RuntimeError(f"Unexpected document action remains: {path}")
    for index, page in enumerate(reader.pages, start=1):
        if page.get("/Annots"):
            raise RuntimeError(f"Unexpected annotations on {path}, page {index}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--realty-source", type=Path, required=True)
    parser.add_argument("--living-source", type=Path, required=True)
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    sources = {"realty": args.realty_source, "living": args.living_source}

    outputs = []
    for key, entity in ENTITIES.items():
        schedule = TMP_DIR / f"{key}-agent-schedule.pdf"
        build_agent_schedule(entity, schedule)
        agent_output = OUTPUT_DIR / entity["agent_filename"]
        combine_agent_package(sources[key], schedule, entity, agent_output)
        leader_output = OUTPUT_DIR / entity["leader_filename"]
        build_team_leader_agreement(entity, leader_output)
        outputs.extend([agent_output, leader_output])

    for output in outputs:
        assert_clean_pdf(output)
        print(output)


if __name__ == "__main__":
    main()
