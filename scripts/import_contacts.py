#!/usr/bin/env python3
"""One-time importer for the company phone sheets into the Calling List.

Reads every sheet of Contacts.xlsx, normalizes each phone number to +92,
deduplicates globally by the last 10 digits, and writes SQL that inserts the
numbers into D1. There is no in-app import screen on purpose: this runs once,
against local D1 while developing and against the deployed database with
`wrangler d1 execute`.

Usage:
    python scripts/import_contacts.py                 # writes .wrangler/calling-list-import.sql
    python scripts/import_contacts.py --owner dev-user
    python scripts/import_contacts.py --out some.sql

Then:
    npx wrangler d1 execute crm --local  --file=.wrangler/calling-list-import.sql
    npx wrangler d1 execute crm --remote --file=.wrangler/calling-list-import.sql

The generated SQL is gitignored because it contains personal contact data.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

import openpyxl

DIGITS = re.compile(r"\d+")
CITIES = [
    "Karachi",
    "Lahore",
    "Faisalabad",
    "Rawalpindi",
    "Islamabad",
    "Peshawar",
    "Quetta",
    "Multan",
    "Bahawalpur",
    "Kasur",
    "Gujranwala",
    "Sialkot",
    "Hyderabad",
    "Sargodha",
    "Abbottabad",
    "Sukkur",
    "Jhang",
    "Sheikhupura",
    "Rahim Yar Khan",
    "Okara",
    "Dera Ghazi Khan",
    "Gujrat",
    "Sahiwal",
    "Mardan",
    "Chiniot",
    "Burewala",
    "Hasilpur",
    "Ahmad Pur East",
    "Ahmedpur East",
]


def raw(value) -> str:
    return "" if value is None else str(value).strip()


def single(value) -> str:
    """One clean line; the PDF extraction appended "Page N" to some cells."""
    text = re.sub(r"\s+", " ", raw(value)).strip()
    return re.sub(r"\s*Page\s+\d+\s*$", "", text, flags=re.I)


def lines(value) -> list[str]:
    return [part.strip() for part in raw(value).split("\n") if part.strip()]


def emails(value) -> str | None:
    found = re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", raw(value).replace("\n", ", "))
    unique = list(dict.fromkeys(found))
    return ", ".join(unique) if unique else None


def normalize(number: str) -> str | None:
    """+92 for Pakistani numbers. Returns None for anything implausible."""
    digits = number
    if digits.startswith("92") and len(digits) in (11, 12):
        return "+" + digits
    if digits.startswith("0") and len(digits) in (10, 11):
        return "+92" + digits[1:]
    if len(digits) == 10 and digits.startswith("3"):
        return "+92" + digits
    if len(digits) == 9 and digits[0] in "3459":
        # A missing leading zero, e.g. 992382084 -> 0992382084.
        return normalize("0" + digits)
    return None


def extract_phones(value) -> list[str]:
    """Every plausible phone number in a cell, including hyphen ranges.

    "041-2557595-96-97" yields 041-2557595, "0300-8662834/0301-8660721"
    yields both, and EMIS codes, registration numbers and dates are rejected
    because they are too short or do not start like a Pakistani number.
    """
    if value is None:
        return []
    found: list[str] = []
    for segment in re.split(r"[,\n;/]|(?:\band\b)", raw(value)):
        groups = DIGITS.findall(segment)
        index = 0
        while index < len(groups):
            matched = False
            for take in (1, 2, 3):
                if index + take > len(groups):
                    break
                number = normalize("".join(groups[index : index + take]))
                if number:
                    found.append(number)
                    index += take
                    matched = True
                    break
            if not matched:
                index += 1
    return list(dict.fromkeys(found))


def pick(items: list[str], index: int) -> str | None:
    if not items:
        return None
    return items[index] if index < len(items) else items[0]


def city_of(*values: str, default: str | None = None) -> str | None:
    haystack = " ".join(raw(value) for value in values).lower()
    for city in CITIES:
        if city.lower() in haystack:
            return city
    return default


def record(phone, company=None, person=None, city=None, address=None, email=None, designation=None):
    return {
        "phone": phone,
        "company": company or None,
        "person": person or None,
        "city": city or None,
        "address": address or None,
        "email": email or None,
        "designation": designation or None,
    }


# --- One parser per sheet ---------------------------------------------------


def parse_bwp(ws):
    out = []
    for row in range(3, ws.max_row + 1):
        schools = lines(ws.cell(row, 9).value)
        if not schools or schools[0].lower().startswith("school name"):
            continue
        heads = lines(ws.cell(row, 10).value)
        teachers = lines(ws.cell(row, 12).value)
        sources = [
            (ws.cell(row, 11).value, heads),
            (ws.cell(row, 13).value, teachers),
            (ws.cell(row, 14).value, teachers),
        ]
        for cell, people in sources:
            phones = extract_phones(cell)
            for index, phone in enumerate(phones):
                out.append(record(phone, pick(schools, index), pick(people, index), "Bahawalpur"))
    return out


def parse_fcci(ws):
    out = []
    for row in range(3, ws.max_row + 1):
        company = single(ws.cell(row, 7).value)
        if not company or company.lower() == "company name":
            continue
        address = single(ws.cell(row, 8).value) or None
        person = single(ws.cell(row, 13).value) or None
        email = emails(ws.cell(row, 12).value)
        phones = extract_phones(ws.cell(row, 9).value) + extract_phones(ws.cell(row, 10).value)
        for phone in phones:
            out.append(record(phone, company, person, city_of(address, default="Faisalabad"), address, email))
    return out


def parse_ngos(ws):
    out = []
    for row in range(3, ws.max_row + 1):
        body = lines(ws.cell(row, 8).value)
        if not body or "name and address" in body[0].lower() or "name & address" in body[0].lower():
            continue
        company = body[0]
        address = ", ".join(body[1:]) or None
        person = single(ws.cell(row, 11).value) or None
        phones = extract_phones(ws.cell(row, 12).value) + extract_phones(ws.cell(row, 13).value)
        for phone in phones:
            out.append(record(phone, company, person, "Lahore", address))
    return out


def parse_karachi(ws):
    out = []
    for row in range(2, ws.max_row + 1):
        company = single(ws.cell(row, 2).value)
        if not company or company.lower() == "company name":
            continue
        person = single(ws.cell(row, 3).value) or None
        address = single(ws.cell(row, 4).value) or None
        phones = extract_phones(ws.cell(row, 5).value) + extract_phones(ws.cell(row, 6).value)
        for phone in phones:
            out.append(record(phone, company, person, "Karachi", address))
    return out


def parse_private_colleges(ws):
    """Colleges are stacked blocks: name lines then a "Phone No." line."""
    out = []
    pending: list[str] = []
    district = None
    last_company = None
    for row in range(3, ws.max_row + 1):
        serial = single(ws.cell(row, 1).value)
        if serial and "college" in serial.lower():
            continue
        if serial and not raw(ws.cell(row, 2).value):
            if "district" in serial.lower():
                district = re.sub(r"districts?", "", serial, flags=re.I).strip(" :-")
            pending = []
            continue
        if serial:
            pending = []
        for line in lines(ws.cell(row, 2).value):
            phones = extract_phones(line)
            if phones:
                company = pending[0] if pending else last_company
                address = ", ".join(pending[1:]) or None
                if company:
                    last_company = company
                for phone in phones:
                    out.append(record(phone, company, None, district or "Bahawalpur", address))
                pending = []
            else:
                pending.append(line)
    return out


def parse_customers(ws):
    out = []
    for row in range(3, ws.max_row + 1):
        company = single(ws.cell(row, 2).value)
        if not company or company.lower() == "customer name":
            continue
        person = single(ws.cell(row, 3).value) or None
        address = single(ws.cell(row, 6).value) or None
        email = emails(ws.cell(row, 5).value)
        for phone in extract_phones(ws.cell(row, 4).value):
            out.append(record(phone, company, person, city_of(address), address, email))
    return out


def parse_stacked_customers(ws):
    """Two side-by-side stacks of blocks, each ending in a phone line."""
    out = []
    for column in (1, 6):
        pending: list[str] = []
        last_company = None
        for row in range(1, ws.max_row + 1):
            line = single(ws.cell(row, column).value)
            if not line:
                continue
            phones = extract_phones(line)
            if phones:
                person = pending[0] if pending else None
                company = pending[1] if len(pending) > 1 else last_company
                address = ", ".join(pending[2:]) or None
                if company:
                    last_company = company
                for phone in phones:
                    out.append(record(phone, company, person, city_of(address), address))
                pending = []
            else:
                pending.append(line)
                if len(pending) > 6:
                    pending = pending[-6:]
    return out


def parse_distributions(ws):
    out = []
    for row in range(3, ws.max_row + 1):
        company = single(ws.cell(row, 4).value)
        if not company or company.lower() == "distribution name":
            continue
        owner = single(ws.cell(row, 5).value) or None
        address = single(ws.cell(row, 8).value) or None
        email = emails(ws.cell(row, 7).value)
        city = single(ws.cell(row, 11).value) or city_of(address, default="Lahore")
        for phone in extract_phones(ws.cell(row, 6).value):
            out.append(record(phone, company, owner, city, address, email))
        da_name = single(ws.cell(row, 9).value) or None
        for phone in extract_phones(ws.cell(row, 10).value):
            out.append(record(phone, company, da_name, city, address))
    return out


def parse_kasur(ws):
    out = []
    for row in range(2, ws.max_row + 1):
        cell = single(ws.cell(row, 1).value)
        if not cell or "college name" in cell.lower():
            continue
        company = re.split(r",", cell)[0].strip()
        address = cell[len(company) :].lstrip(", ") or None
        person = single(ws.cell(row, 3).value) or None
        for phone in extract_phones(ws.cell(row, 4).value):
            out.append(record(phone, company, person, "Kasur", address))
    return out


def parse_smart_schools(ws):
    out = []
    for row in range(2, ws.max_row + 1):
        company = single(ws.cell(row, 2).value)
        if not company or "campus name" in company.lower():
            continue
        city = single(ws.cell(row, 1).value) or None
        address = single(ws.cell(row, 3).value) or None
        for phone in extract_phones(ws.cell(row, 4).value):
            out.append(record(phone, company, None, city, address))
    return out


SHEETS = {
    "BWP-Centers": ("BWP Centres", parse_bwp),
    "CORPORATE-LIST-FCCI": ("FCCI Corporate", parse_fcci),
    "Lahore-NGOS": ("Lahore NGOs", parse_ngos),
    "list-of-companies-in-Karachi": ("Karachi Companies", parse_karachi),
    "Updated-List-of-Private-Affilia": ("Private Affiliated Colleges", parse_private_colleges),
    "Company-Customer-List_Customr D": ("Customer List D", parse_customers),
    "Company-Customer-List_customer ": ("Customer List", parse_stacked_customers),
    "Lahore-Distributions-Training_S": ("Lahore Distributions", parse_distributions),
    "DDC_Kasur_Colleges": ("DDC Kasur Colleges", parse_kasur),
    "SmartSchools_Campuses": ("Smart Schools", parse_smart_schools),
}


def sql_value(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def build(workbook: str, owner: str) -> tuple[dict[str, dict], dict[str, int]]:
    wb = openpyxl.load_workbook(workbook, data_only=True)
    contacts: dict[str, dict] = {}
    per_sheet: dict[str, int] = {}

    for sheet_name, (label, parser) in SHEETS.items():
        ws = wb[sheet_name]
        rows = parser(ws)
        per_sheet[label] = len(rows)
        for row in rows:
            phone = row["phone"]
            key = re.sub(r"\D", "", phone)[-10:]
            if len(key) < 9:
                continue
            existing = contacts.get(key)
            if existing:
                # A number on several sheets keeps every list, and the first
                # record with a person or company name wins for display.
                lists = existing["sources"]
                if label not in lists:
                    lists.append(label)
                    existing["source"] = ", ".join(lists)
                for field in ("company", "person", "city", "address", "email", "designation"):
                    if not existing[field] and row[field]:
                        existing[field] = row[field]
                continue
            contacts[key] = {
                "phone": phone,
                "key": key,
                "company": row["company"],
                "person": row["person"],
                "city": row["city"],
                "address": row["address"],
                "email": row["email"],
                "designation": row["designation"],
                "sources": [label],
                "source": label,
            }
    return contacts, per_sheet


def write_sql(contacts: dict[str, dict], owner: str, out_path: str) -> None:
    rows = sorted(contacts.values(), key=lambda item: (item["source"], item["company"] or "", item["phone"]))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    header = [
        "-- Generated by scripts/import_contacts.py. Contains personal data: do not commit.",
        f"-- {len(rows)} unique phone numbers.",
        "PRAGMA foreign_keys = ON;",
        "",
    ]
    statements: list[str] = []
    chunk = 200
    for start in range(0, len(rows), chunk):
        values = []
        for row in rows[start : start + chunk]:
            fields = [
                "lower(hex(randomblob(16)))",
                sql_value(owner),
                sql_value(row["phone"]),
                sql_value(row["key"]),
                sql_value(row["person"]),
                sql_value(row["company"]),
                sql_value(row["designation"]),
                sql_value(row["city"]),
                sql_value(row["address"]),
                sql_value(row["email"]),
                sql_value(row["source"]),
                "'Not called'",
                "CAST(strftime('%s','now') AS INTEGER) * 1000",
                "CAST(strftime('%s','now') AS INTEGER) * 1000",
            ]
            values.append("(" + ", ".join(fields) + ")")
        statements.append(
            "INSERT OR IGNORE INTO outreach_contacts\n"
            "  (id, owner_sub, phone, phone_key, person_name, company_name, designation, city, address, email, source_list, status, created_at, updated_at)\n"
            "VALUES\n" + ",\n".join(values) + ";\n"
        )
    with open(out_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(header) + "\n".join(statements))


def main() -> int:
    parser = argparse.ArgumentParser(description="Import company phone sheets into the Calling List.")
    parser.add_argument("--workbook", default="Contacts.xlsx")
    parser.add_argument("--owner", default="dev-user", help="Workspace owner_sub the rows belong to.")
    parser.add_argument("--out", default=os.path.join(".wrangler", "calling-list-import.sql"))
    parser.add_argument("--summary", default=os.path.join(".wrangler", "calling-list-import-summary.json"))
    args = parser.parse_args()

    if not os.path.exists(args.workbook):
        print(f"Workbook not found: {args.workbook}", file=sys.stderr)
        return 1

    contacts, per_sheet = build(args.workbook, args.owner)
    write_sql(contacts, args.owner, args.out)

    summary = {
        "unique_numbers": len(contacts),
        "rows_read_per_sheet": per_sheet,
        "rows_after_dedupe": len(contacts),
        "sql": args.out,
        "owner": args.owner,
    }
    os.makedirs(os.path.dirname(args.summary) or ".", exist_ok=True)
    with open(args.summary, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    print(f"Read {sum(per_sheet.values())} number rows from {len(per_sheet)} sheets.")
    for label, count in per_sheet.items():
        print(f"  {label:32} {count:6}")
    print(f"Unique numbers after dedupe: {len(contacts)}")
    print(f"SQL written to {args.out}")
    print(f"Summary written to {args.summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
