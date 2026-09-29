"""Parser tests: `uv run python -m unittest` from scraper/.

Cases come from real comments that earlier parser versions got wrong.
"""

import unittest
from datetime import datetime, timezone

from reddit_opt_scraper.exporter import merge_by_author
from reddit_opt_scraper.parser import parse_comment, parse_date, validate_dates


def at(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


DATE_CASES = [
    # value, as_of, past, expected
    ("05/19/2026", "2026-06-01", True, "2026-05-19"),
    ("5/19", "2026-06-01", True, "2026-05-19"),
    ("05/19 (email); 05/21 (portal)", "2026-06-01", True, "2026-05-19"),
    ("7/9", "2026-07-20", True, "2026-07-09"),
    ("12/28", "2026-02-10", True, "2025-12-28"),           # yearless across New Year
    ("2025/05/02", "2025-06-01", True, "2025-05-02"),
    ("2026-05-19", "2026-06-01", True, "2026-05-19"),
    ("May 31", "2026-06-10", True, "2026-05-31"),
    ("Mar. 15", "2026-04-01", True, "2026-03-15"),
    ("Oct 16th, 2025", "2025-11-01", True, "2025-10-16"),
    ("May 24th,2025", "2025-06-01", True, "2025-05-24"),
    ("Nov 27th 2025", "2025-12-01", True, "2025-11-27"),
    ("March 12,2026", "2026-04-01", True, "2026-03-12"),
    ("5 Nov, 2025", "2025-12-01", True, "2025-11-05"),
    ("13th Nov 2025", "2025-12-01", True, "2025-11-13"),
    ("10th Jan", "2026-01-12", True, "2026-01-10"),         # edited-in January approval
    ("19th of May 2026", "2026-06-01", True, "2026-05-19"),
    ("20/Mar", "2026-04-01", True, "2026-03-20"),
    ("16 Oct 2025", "2025-11-01", True, "2025-10-16"),
    ("May 2026", "2026-06-01", True, "2026-05-01"),         # month-year → 1st, not May 20
    ("Sept 3, 2025", "2025-10-01", True, "2025-09-03"),
    ("25/03/2026", "2026-04-01", True, "2026-03-25"),       # DD/MM when MM/DD impossible
    ("06/05/2026", "2026-05-20", True, "2026-05-06"),       # MM/DD in future → DD/MM
    ("05/06/2026", "2026-05-20", True, "2026-05-06"),       # both past → MM/DD
    ("12/04/25", "2025-07-22", True, "2025-04-12"),         # MM/DD future → DD/MM
    ("24th Dec 2026", "2026-02-26", True, "2025-12-24"),    # year typo
    ("12/10/2026", "2026-07-18", True, "2025-12-10"),       # year typo
    ("09/25/2027", "2026-09-25", True, "2026-09-25"),       # year typo
    ("Scheduled (5/27/2026)", "2026-05-20", True, None),    # future appointment, not done
    ("06/11/2026", "2026-06-11", True, "2026-06-11"),
    ("06/12/2026", "2026-06-11", True, "2026-06-12"),       # +1 day timezone allowance
    ("08/01/2026", "2026-05-01", False, "2026-08-01"),      # start date may be future
    ("July 7th", "2026-05-01", False, "2026-07-07"),        # future-allowed yearless
    ("MM/DD/YYYY", "2026-05-01", True, None),
    ("N/A", "2026-05-01", True, None),
    ("TBD", "2026-05-01", True, None),
    ("may be next week", "2026-05-01", True, None),
    ("YES | 02/14/2026", "2026-03-01", True, "2026-02-14"),
    ("05 / 15 / 2025", "2025-06-01", True, "2025-05-15"),
    ("on 09/18/2026", "2026-09-20", True, "2026-09-18"),
    ("API update 6/19 morning", "2026-06-20", True, "2026-06-19"),
    ("31/02/2026", "2026-04-01", True, None),               # impossible both ways
]


class ParseDate(unittest.TestCase):
    def test_cases(self):
        for value, as_of, past, expected in DATE_CASES:
            with self.subTest(value=value, as_of=as_of):
                self.assertEqual(parse_date(value, as_of=at(as_of), past=past), expected)


class ParseComment(unittest.TestCase):
    def parse(self, body: str, as_of: str) -> dict:
        return validate_dates(parse_comment(body, as_of=at(as_of)), at(as_of))

    def test_rich_text_value_on_next_line(self):
        r = self.parse("* **Type:**\xa0Initial POST‑COMPLETION OPT\n* **Date Applied:**\xa003/02/2026\n"
                       "* **Date Approved:**\xa0\n\n05/21/2026\n\n* **Date Card Produced:**\xa0\n\n05/28/2026", "2026-06-01")
        self.assertEqual((r["date_applied"], r["date_approved"], r["date_card_produced"]),
                         ("2026-03-02", "2026-05-21", "2026-05-28"))

    def test_flattened_template(self):
        r = self.parse("Type: Initial POST‑COMPLETION OPT Premium Processing: NO Date Applied:  03/13/2026 "
                       "Request for Initial Evidence (RFIE): N/A Biometrics Requested: 03/20/2026", "2026-04-01")
        self.assertEqual((r["normalized_type"], r["premium_processing"], r["date_applied"], r["rfie_date"],
                          r["biometrics_requested_date"]), ("OPT", False, "2026-03-13", None, "2026-03-20"))

    def test_bare_keys_and_typos(self):
        r = self.parse("Type: Initial POST OPT\n\nData Applied: 13th Nov 2025\n\nApproved: Jan 10th", "2026-01-12")
        self.assertEqual((r["date_applied"], r["date_approved"], r["days_to_approval"]), ("2025-11-13", "2026-01-10", 58))

    def test_mistyped_approval_year(self):
        r = self.parse("Type: Initial POST OPT\nDate Applied: 13th Nov 2025\nDate approved: 10th Jan 2025", "2026-01-12")
        self.assertEqual(r["date_approved"], "2026-01-10")

    def test_denial_is_not_an_approval(self):
        r = self.parse("Type: OPT\nDate Applied: 03/01/2026\nDate Approved: DENIED ON MAY 13TH, 2026", "2026-05-20")
        self.assertIsNone(r["date_approved"])

    def test_prose_is_not_a_date_field(self):
        r = self.parse("Type: OPT\nDate Applied: 03/01/2026\napproval without premium? I applied on March 7th.", "2026-05-20")
        self.assertIsNone(r["date_approved"])

    def test_upgrade_with_yearless_date(self):
        r = self.parse("Premium Processing: YES (upgraded on 05/08)\nDate Applied: 03/04/2026", "2026-05-20")
        self.assertEqual((r["pp_upgraded"], r["pp_upgrade_date"]), (True, "2026-05-08"))


def post(cid, created, **fields):
    base = {"comment_id": cid, "author": "a", "created_utc": created, "last_seen_utc": created,
            "normalized_type": "OPT", "date_applied": None, "date_approved": None}
    return base | fields


class MergeByAuthor(unittest.TestCase):
    def test_status_update_joins_its_application(self):
        out = merge_by_author([
            post("1", "2026-04-01T00:00:00+00:00", date_applied="2026-02-18"),
            post("2", "2026-06-19T00:00:00+00:00", date_approved="2026-06-19"),
        ])
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0]["comment_id"], out[0]["date_applied"], out[0]["days_to_approval"]), ("2", "2026-02-18", 121))

    def test_receipt_vs_filing_day_is_same_application(self):
        out = merge_by_author([
            post("1", "2026-04-01T00:00:00+00:00", date_applied="2026-03-16"),
            post("2", "2026-05-10T00:00:00+00:00", date_applied="2026-03-17", date_approved="2026-05-10"),
        ])
        self.assertEqual(len(out), 1)

    def test_different_applications_stay_apart(self):
        out = merge_by_author([
            post("1", "2025-04-01T00:00:00+00:00", date_applied="2025-03-01", date_approved="2025-03-30"),
            post("2", "2026-02-01T00:00:00+00:00", normalized_type="STEM", date_applied="2026-01-15"),
            post("3", "2025-06-01T00:00:00+00:00", date_applied="2025-05-20"),
        ])
        self.assertEqual(len(out), 3)


if __name__ == "__main__":
    unittest.main()
