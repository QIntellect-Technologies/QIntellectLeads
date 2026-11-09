#!/usr/bin/env python3
"""Migrate QT-Leads-WhatsAPP.xlsx into the lead app.

Reads the Master_Leads, History, Sheet1 and Queries sheets, normalises the
legacy values, and posts a full backup to /api/import/backup (which preserves
codes, dates, history, meetings and templates).

Dry run (default):  python scripts/import_qt_workbook.py
Live import:        python scripts/import_qt_workbook.py --live
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "QT-Leads-WhatsAPP.xlsx"
API = "http://localhost:5173"
ORIGIN = "http://localhost:5173"
PKT = timezone(timedelta(hours=5))

STATUS_MAP = {
    "new": "new",
    "1st message": "contacted",
    "first message": "contacted",
    "call attempted": "contacted",
    "not responding": "contacted",
    "no response": "contacted",
    "connected": "connected",
    "interested": "connected",
    "interested but evaluating options": "connected",
    "follow up required": "connected",
    "follow up pending": "connected",
    "demo scheduled": "demo_scheduled",
    "demo fixed": "demo_scheduled",
    "demo done": "demo_done",
    "demo trail": "demo_done",
    "trial": "demo_done",
    "proposal sent": "proposal_sent",
    "price high": "proposal_sent",
    "under review": "proposal_sent",
    "decision pending": "proposal_sent",
    "negotiation": "negotiation",
    "negotiation in progress": "negotiation",
    "postponed": "postponed",
    "postponded": "postponed",
    "on hold": "postponed",
    "immature lead": "postponed",
    "closed won": "won",
    "won": "won",
    "closed lost": "lost",
    "not interested": "lost",
    "not intrested": "lost",
    "not relevant": "lost",
    "b2b": "new",
    "": "new",
}

PRODUCT_RULES = [
    ("AI Chatbot", ("chatbot", "food ordering", "ai call agent")),
    ("GPS Tracking", ("gps", "tracker", "tracking system", "vehicle tracking")),
    ("HR / Payroll", ("payroll", "hr module", "hr modules", "human resource", "shift management")),
    (
        "AI Attendance System",
        ("attendance", "attendence", "attendnce", "attendnece", "face recognition", "biometric", "access control", "monitoring", "chalan", "fee payment"),
    ),
]


def norm_key(value) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+/ ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def meaningful(value) -> str:
    text = clean(value)
    if text.lower().strip(" .-") in ("none", "n a", "n/a", "pending", "not available", "no remarks", "na"):
        return ""
    return text


def map_status(value) -> str:
    return STATUS_MAP.get(norm_key(value), "")


def normalize_product(value) -> str:
    text = norm_key(value)
    for product, needles in PRODUCT_RULES:
        if any(needle in text for needle in needles):
            return product
    if "software" in text:
        return "Other"
    return ""


def normalize_source(value) -> str:
    text = clean(value)
    key = norm_key(text)
    if key.startswith("meta ads"):
        return "Meta Ads (40%)" if "40" in key else "Meta Ads"
    if key in ("whats app", "whatsapp"):
        return "WhatsApp"
    if key == "website":
        return "Website"
    if key in ("referral", "cold call", "walk in"):
        return text.title()
    return text if text and key != "pending" else "Other"


def normalize_phone(value) -> str:
    digits = re.sub(r"\D", "", clean(value))
    if not digits:
        return ""
    if digits.startswith("92"):
        return f"+{digits}"
    if digits.startswith("0"):
        return f"+92{digits[1:]}"
    if len(digits) == 10 and digits.startswith("3"):
        return f"+92{digits}"
    return f"+{digits}"


def phone_key(value) -> str:
    return re.sub(r"\D", "", clean(value))[-10:]


def split_phones(value) -> list[str]:
    raw = clean(value)
    if not raw:
        return []
    parts = re.split(r"[,;/]| or ", raw)
    phones = []
    for part in parts:
        phone = normalize_phone(part)
        if len(re.sub(r"\D", "", phone)) >= 10 and phone not in phones:
            phones.append(phone)
    return phones


def parse_dt(value) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, time):
        return None
    raw = clean(value)
    if not raw or raw.lower() in ("none", "pending", "n/a", "-", "0"):
        return None
    if re.fullmatch(r"\d+(\.\d+)?", raw):
        serial = float(raw)
        if 20000 < serial < 80000:
            return datetime(1899, 12, 30) + timedelta(days=serial)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None)
    except ValueError:
        pass
    match = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$", raw, re.I)
    if match:
        month, day, year, hour, minute, second, suffix = match.groups()
        year = int(year)
        if year < 100:
            year += 2000
        hour = int(hour or 0)
        if suffix and suffix.upper() == "PM" and hour < 12:
            hour += 12
        if suffix and suffix.upper() == "AM" and hour == 12:
            hour = 0
        try:
            return datetime(year, int(month), int(day), hour, int(minute or 0), int(second or 0))
        except ValueError:
            return None
    return None


def iso_stamp(value, fallback: datetime) -> str:
    dt = parse_dt(value) or fallback
    return dt.replace(tzinfo=PKT).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def iso_date(value, fallback: datetime) -> str:
    dt = parse_dt(value) or fallback
    return dt.strftime("%Y-%m-%d")


def epoch_of(value, fallback: datetime) -> int:
    dt = parse_dt(value) or fallback
    return int(dt.replace(tzinfo=PKT).astimezone(timezone.utc).timestamp() * 1000)


def loss_reason(*values) -> str:
    text = " ".join(clean(v) for v in values if v).lower()
    if any(word in text for word in ("another system", "another device", "another attendance system", "purchased another", "existing system", "existing solution", "already implemented", "already using", "using another", "selected an alternative", "alternative solution")):
        return "Chose another system"
    if any(word in text for word in ("price", "pricing", "expensive", "high rate", "rate high", "cost too high", "high pricing")):
        return "Price too high"
    if "budget" in text:
        return "Budget not available"
    if any(word in text for word in ("one time", "one-time", "hardware", "camera", "dvr")):
        return "Prefers one-time or hardware purchase"
    if any(word in text for word in ("network", "connectivity", "integration")):
        return "Integration or network issue"
    if any(word in text for word in ("job", "wrong", "mistaken", "personal use", "not a product")):
        return "Wrong lead (job seeker, personal use)"
    if any(word in text for word in ("no response", "not responding", "unreachable", "no answer", "unresponsive", "lack of engagement", "lack of confirmation", "no clear commitment")):
        return "No response"
    if any(word in text for word in ("not interested", "not relevant", "irrelevant", "immature", "no current requirement", "no immediate requirement", "requirement cancelled", "no requirement", "not proceeding", "not sure")):
        return "No current requirement"
    return "Other"


def headcount_from_details(value) -> int | None:
    text = clean(value)
    matches = re.findall(r"(\d[\d,]*)\s*(?:\+|plus\s*)?(?:employees?|staff(?:\s+members?)?|team\s+members?)", text, re.I)
    if not matches:
        match = re.search(r"staff\s+under\s+(\d[\d,]*)", text, re.I)
        if match:
            matches = [match.group(1)]
    numbers = []
    for match in matches:
        try:
            numbers.append(int(match.replace(",", "")))
        except ValueError:
            continue
    return max(numbers) if numbers else None


def unique_note_text(value) -> str:
    text = clean(value)
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="write to the running app")
    parser.add_argument("--url", default=API)
    parser.add_argument("--workbook", default=str(WORKBOOK))
    parser.add_argument("--dump", default="", help="write the generated backup JSON here")
    args = parser.parse_args()

    wb = openpyxl.load_workbook(args.workbook, data_only=True)

    master_ws = wb["Master_Leads"]
    headers = [clean(c.value) for c in master_ws[1]]
    master_rows = []
    for row in master_ws.iter_rows(min_row=2, values_only=True):
        record = dict(zip(headers, row))
        if not clean(record.get("Lead ID")):
            continue
        if not any(clean(record.get(key)) for key in ("Company Name", "Contact Person", "Contact No")):
            continue
        master_rows.append(record)

    history_ws = wb["History"]
    history_headers = [clean(c.value) for c in history_ws[1]][:9]
    history_rows = []
    for row in history_ws.iter_rows(min_row=2, values_only=True):
        record = dict(zip(history_headers, row[:9]))
        if not clean(record.get("Lead ID")):
            continue
        history_rows.append(record)

    history_by_lead: dict[str, list[dict]] = collections.defaultdict(list)
    for row in history_rows:
        code = clean(row.get("Lead ID")).upper()
        history_by_lead[code].append(row)

    leads: list[dict] = []
    status_counts: collections.Counter[str] = collections.Counter()
    unmapped_statuses: collections.Counter[str] = collections.Counter()
    product_counts: collections.Counter[str] = collections.Counter()
    loss_counts: collections.Counter[str] = collections.Counter()
    warnings: list[str] = []
    total_interactions = 0
    total_meetings = 0
    total_followups = 0
    no_loss_reason: list[str] = []

    for record in master_rows:
        code = clean(record.get("Lead ID")).upper()
        raw_status = clean(record.get("Current Status"))
        status = map_status(raw_status)
        if not status:
            unmapped_statuses[raw_status] += 1
            status = "new"
        status_counts[status] += 1

        created = parse_dt(record.get("Date Added")) or datetime(2026, 6, 1)
        updated = parse_dt(record.get("Last Updated")) or created
        created_date = created.strftime("%Y-%m-%d")

        company = clean(record.get("Company Name"))
        org_type = clean(record.get("Company Type"))
        contact_name = clean(record.get("Contact Person")) or company or code
        requirement_raw = clean(record.get("Requirement"))
        details = clean(record.get("Details Gathered"))
        notes = meaningful(record.get("Notes"))
        objection = meaningful(record.get("Objection"))
        remarks = meaningful(record.get("Remarks"))
        last_note = meaningful(record.get("Last Note"))
        meeting_text = meaningful(record.get("Meeting"))
        poc_name = meaningful(record.get("POC Name"))
        poc_value = meaningful(record.get("POC"))
        follow_up_raw = clean(record.get("Next Follow-Up"))
        follow_mode = "Auto" if clean(record.get("Follow-Up Source")).upper() == "AUTO" else "Manual"
        product = normalize_product(requirement_raw) or normalize_product(details)
        product_counts[product or "(blank)"] += 1
        source = normalize_source(record.get("Lead Source"))
        b2b = norm_key(raw_status) == "b2b" or clean(record.get("Company Type")).lower() == "b2b"

        phones = split_phones(record.get("Contact No"))
        primary_phone = phones[0] if phones else ""
        if not primary_phone:
            warnings.append(f"{code}: no usable phone")

        contacts = []
        if contact_name or primary_phone:
            contacts.append({"fullName": contact_name, "phone": primary_phone, "designation": meaningful(record.get("POC")) if poc_value and not re.search(r"\d{7,}", poc_value) else None, "role": "Primary"})
        for extra_phone in phones[1:]:
            contacts.append({"fullName": contact_name, "phone": extra_phone, "role": "Point of Contact"})
        poc_phones = split_phones(poc_value)
        if poc_name or poc_phones:
            contacts.append(
                {
                    "fullName": poc_name or "Point of Contact",
                    "phone": poc_phones[0] if poc_phones else "",
                    "role": "Point of Contact",
                }
            )
        # Drop empty extras, keep primary first.
        contacts = [c for c in contacts if clean(c.get("fullName")) or clean(c.get("phone"))]

        lost = status == "lost"
        combined_remarks = " ".join([objection, remarks, last_note])
        if lost:
            history_text = " ".join(
                f"{clean(h.get('Detailed Note'))} {clean(h.get('Objection'))} {clean(h.get('Remarks'))}"
                for h in history_by_lead.get(code, [])[-4:]
            )
            reason = loss_reason(raw_status, combined_remarks, history_text)
            loss_counts[reason] += 1
            if not reason or reason == "Other":
                no_loss_reason.append(code)
        else:
            reason = ""

        internal = remarks
        extras = []
        if meeting_text and not re.search(r"^\d{2}:\d{2}", meeting_text):
            extras.append(f"Meeting note: {meeting_text}")
        if poc_value and not re.search(r"\d{7,}", poc_value) and not poc_name and meaningful(poc_value):
            extras.append(f"POC: {meaningful(poc_value)}")
        if extras:
            internal = "\n".join([internal, *extras]).strip()

        lead = {
            "code": code,
            "createdDate": created_date,
            "source": source,
            "product": product,
            "status": status,
            "assignedTo": "Imran",
            "b2b": b2b,
            "archived": False,
            "createdAt": epoch_of(record.get("Date Added"), created),
            "updatedAt": epoch_of(record.get("Last Updated"), updated),
            "organization": {
                "name": company or None,
                "type": org_type or None,
                "city": None,
                "headcount": headcount_from_details(details),
                "existingSystem": None,
            },
            "contacts": contacts,
            "requirement": {
                "summary": requirement_raw or None,
                "details": details or None,
                "objectionType": objection or None,
                "lossReason": reason or None,
                "internalRemarks": internal or None,
            },
            "interactions": [],
            "followUps": [],
            "meetings": [],
        }

        seen_notes: set[str] = set()

        def add_note(value: str, interaction_date, channel: str = "Note", outcome: str = "", status_after=None):
            text_value = meaningful(value)
            key = unique_note_text(text_value)
            if not text_value:
                return False
            # The Master sheet's Last Note is usually the same sentence already
            # present in History, sometimes with an extra remarks line attached.
            if len(key) > 12 and any(key in seen or seen in key for seen in seen_notes):
                return False
            if key:
                seen_notes.add(key)
            lead["interactions"].append(
                {
                    "date": iso_stamp(interaction_date, created),
                    "channel": channel,
                    "outcome": outcome or None,
                    "note": text_value,
                    "statusAfter": status_after,
                }
            )
            return True

        # Full status/interaction history from the History sheet.
        for row in history_by_lead.get(code, []):
            row_date = parse_dt(row.get("Date & Time")) or updated
            raw_row_status = clean(row.get("Status"))
            row_status = map_status(raw_row_status)
            parts = []
            if clean(row.get("Detailed Note")):
                parts.append(clean(row.get("Detailed Note")))
            if meaningful(row.get("Objection")) and norm_key(row.get("Objection")) not in ("none", "none stated", "no specific objection shared"):
                parts.append(f"Objection: {meaningful(row.get('Objection'))}")
            if meaningful(row.get("Remarks")):
                parts.append(f"Remarks: {meaningful(row.get('Remarks'))}")
            follow_value = row.get("Next Follow-Up")
            follow_dt = parse_dt(follow_value)
            if follow_dt:
                parts.append(f"Next follow-up: {follow_dt:%d-%b-%Y}")
            note_text = "\n".join(parts)
            meeting_value = row.get("Meeting")
            meeting_dt = parse_dt(meeting_value)
            if isinstance(meeting_value, time):
                # A time-only entry (e.g. 14:00) belongs to the row's date.
                meeting_dt = datetime.combine(row_date.date(), meeting_value)
            if meeting_value and not meeting_dt:
                note_text = "\n".join([note_text, f"Meeting: {clean(meeting_value)}"]).strip()
            if not note_text:
                # Every History row is a real status event; keep it even when the
                # note itself was left blank in the sheet.
                note_text = f"Status: {raw_row_status}" if raw_row_status else "Imported history entry"
            if note_text:
                key = unique_note_text(note_text)
                if key:
                    seen_notes.add(key)
                # Keep every history entry, even when the same sentence was logged
                # on different days; de-duplicating here would erase real touches.
                lead["interactions"].append(
                    {
                        "date": iso_stamp(row_date, created),
                        "channel": "Note",
                        "outcome": raw_row_status or None,
                        "note": note_text,
                        "statusAfter": row_status or None,
                    }
                )
            if meeting_dt:
                scheduled = iso_stamp(meeting_dt, created)
                if not any(m["scheduledAt"] == scheduled for m in lead["meetings"]):
                    lead["meetings"].append(
                        {
                            "scheduledAt": scheduled,
                            "type": "Meeting",
                            "status": "Scheduled",
                            "notes": clean(row.get("Detailed Note"))[:500] or None,
                        }
                    )

        # Master notes and the current last note, without duplicating history.
        add_note(notes, record.get("Date Added"), outcome="Imported note")
        add_note(last_note, record.get("Last Updated"), outcome="Last note")

        # Current open follow-up (closed leads have none).
        if follow_up_raw and parse_dt(follow_up_raw) and status not in ("won", "lost"):
            due_date = iso_date(follow_up_raw, updated)
            lead["followUps"].append({"dueDate": due_date, "mode": follow_mode, "completed": False})

        total_interactions += len(lead["interactions"])
        total_meetings += len(lead["meetings"])
        total_followups += len(lead["followUps"])
        leads.append(lead)

    # Sheet1: early scratch notes for QT-001..QT-017, added only when new.
    by_phone = {}
    by_contact = {}
    for lead in leads:
        for contact in lead["contacts"]:
            if contact.get("phone"):
                by_phone.setdefault(phone_key(contact["phone"]), lead["code"])
            if contact.get("fullName"):
                by_contact.setdefault(norm_key(contact["fullName"]), lead["code"])

    sheet1_added = 0
    ws1 = wb["Sheet1"]
    existing_by_code = {lead["code"]: lead for lead in leads}
    for row_index in range(1, ws1.max_row + 1):
        values = [ws1.cell(row_index, col).value for col in range(1, 12)]
        phone = phone_key(values[3])
        contact = norm_key(values[2])
        code = by_phone.get(phone) or by_contact.get(contact)
        if not code:
            continue
        parts = []
        if clean(values[6]):
            parts.append(clean(values[6]))
        if clean(values[9]):
            parts.append(f"Next action: {clean(values[9])}")
        notes_row = [ws1.cell(row_index + 1, col).value for col in range(1, 12)]
        if clean(notes_row[0]).lower() == "notes" and clean(notes_row[1]):
            parts.append(f"Notes: {clean(notes_row[1])}")
        text_value = "\n".join(parts).strip()
        if not text_value:
            continue
        lead = existing_by_code[code]
        keys = {unique_note_text(i.get("note")) for i in lead["interactions"]}
        if any(unique_note_text(text_value) in key or key in unique_note_text(text_value) for key in keys if key):
            continue
        lead["interactions"].append(
            {
                "date": iso_stamp(values[0], parse_dt(lead["createdDate"]) or datetime(2026, 6, 1)),
                "channel": "Note",
                "outcome": "Scratch sheet",
                "note": text_value,
                "statusAfter": map_status(values[8]) or None,
            }
        )
        sheet1_added += 1

    # Queries: all unique WhatsApp / call scripts.
    templates: list[dict] = []
    template_bodies: set[str] = set()
    template_names: set[str] = set()
    queries = wb["Queries"]
    column_labels = {4: clean(queries.cell(1, 4).value), 5: clean(queries.cell(1, 5).value)}
    # Columns D/E are not row-wise variants of column A. They are an ordered
    # restaurant sequence: first contact, booking, POC, pain points, reminder,
    # concerns, non-responsive, out of city.
    restaurant_labels = [
        "First Contact",
        "Booking a Call/Demo",
        "Requesting a POC (Point of Contact)",
        "Current System Pain Points",
        "Same-Day Meeting Reminder",
        "Checking for Concerns/Response",
        "Non-Responsive Client \u2014 Touch 1",
        "Client Out of City/Country",
    ]

    def segment_for(name: str, body: str) -> str:
        text = f"{name} {body}".lower()
        if "wrong-fit" in text or "wrong fit" in text or "job seeker" in text or "personal vehicle" in text:
            return "Closing"
        if "postpone" in text or "personal reason" in text or "family reason" in text or "personal/family" in text:
            return "Postponed"
        if "price" in text or "pricing" in text or "biometric" in text or "cost" in text:
            return "Pricing"
        if "demo" in text or "meeting" in text or "reminder" in text or "timing" in text:
            return "Demo"
        if "follow" in text or "non-responsive" in text or "non responsive" in text or "concern" in text or "cold" in text:
            return "Follow-up"
        if "closing" in text or "decision" in text or "non-serious" in text:
            return "Closing"
        if "first contact" in text or "opening" in text or "intro" in text or "thank you for your interest" in text:
            return "Intro"
        return "Other"

    def add_template(name: str, body: str, usage: str, product: str, segment: str | None = None):
        name = re.sub(r"\s+", " ", clean(name))[:160]
        body = clean(body)
        if not name or not body or body.lower() == "message script (copy-paste)":
            return
        key_body = body.lower()
        if key_body in template_bodies:
            return
        base = name
        index = 2
        while name.lower() in template_names:
            name = f"{base} ({index})"[:160]
            index += 1
        template_bodies.add(key_body)
        template_names.add(name.lower())
        templates.append({"name": name, "segment": segment or segment_for(name, body), "product": product, "usageScenario": usage[:300], "body": body})

    for row_index in range(2, 25):
        segment_name = clean(queries.cell(row_index, 1).value)
        usage = clean(queries.cell(row_index, 2).value)
        if not segment_name:
            continue
        generic_body = queries.cell(row_index, 3).value
        if clean(generic_body):
            add_template(segment_name, generic_body, usage, "AI Chatbot" if "chatbot" in clean(generic_body).lower() else "AI Attendance System")
        if 2 <= row_index <= 9:
            label = restaurant_labels[row_index - 2]
            for col, suffix, product in (
                (4, column_labels.get(4, "Restaurant"), "AI Attendance System"),
                (5, column_labels.get(5, "Restaurant"), "AI Chatbot"),
            ):
                body = queries.cell(row_index, col).value
                if clean(body):
                    suffix = re.sub(r"\s*[\u2013\u2014]\s*", " \u2014 ", suffix or "Restaurant")
                    add_template(f"{suffix} \u2014 {label}", body, usage, product)

    for row_index in range(28, 37):
        name = clean(queries.cell(row_index, 1).value)
        usage = clean(queries.cell(row_index, 2).value)
        body = queries.cell(row_index, 3).value
        if name and clean(body):
            add_template(f"Call: {name}", body, usage, "", "Call")

    backup = {"replace": True, "leads": leads, "templates": templates}

    print(f"Leads: {len(leads)}")
    print(f"Statuses: {dict(status_counts)}")
    print(f"Unmapped statuses: {dict(unmapped_statuses)}")
    print(f"Products: {dict(product_counts)}")
    print(f"Loss reasons: {dict(loss_counts)}")
    print(f"Interactions: {sum(len(l['interactions']) for l in leads)} (including {sheet1_added} from Sheet1)")
    print(f"Follow-ups: {sum(len(l['followUps']) for l in leads)}")
    print(f"Meetings: {sum(len(l['meetings']) for l in leads)}")
    print(f"Templates: {len(templates)}")
    print(f"Lost leads with only Other/no reason: {len(no_loss_reason)} {no_loss_reason[:20]}")
    print(f"Warnings: {len(warnings)}")
    for warning in warnings[:20]:
        print("  -", warning)

    if args.dump:
        Path(args.dump).write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote {args.dump}")

    if not args.live:
        print("\nDry run only. Re-run with --live to replace the app data.")
        return 0

    lead_chunks = [leads[i : i + 80] for i in range(0, len(leads), 80)]
    for index, chunk in enumerate(lead_chunks):
        payload = {"replace": index == 0, "leads": chunk, "templates": templates if index == 0 else []}
        request = urllib.request.Request(
            f"{args.url}/api/import/backup",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Origin": ORIGIN},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                result = json.loads(response.read())
        except urllib.error.HTTPError as error:
            print(error.read().decode("utf-8", "replace"))
            raise
        print(f"Chunk {index + 1}/{len(lead_chunks)}: {result}")

    print("Import complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
