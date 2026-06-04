"""CLI entry-point: `uv run scrape`"""

import json
import sys
import time
import traceback
from datetime import date, datetime, timezone
from pathlib import Path

import click
import httpx
from dotenv import load_dotenv
from rich.console import Console

# Load credentials from a local .env (Supabase + optional Reddit OAuth) if present.
# In CI these come from the environment/secrets, so a missing file is fine.
load_dotenv()
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from . import supastore
from .config import THREADS, DEFAULT_OUTPUT, REQUEST_DELAY
from .fetcher import fetch_all_comments
from .parser import parse_comment, compute_derived, has_template_data
from .exporter import dedupe_by_author_date, load_existing, merge, save

# Date fields that must not be in the future. We use a single "today" snapshot
# captured at scrape start so a long run doesn't produce inconsistent results
# across the boundary of midnight UTC.
_FUTURE_NULLABLE_FIELDS = (
    "date_approved",
    "date_card_produced",
    "date_card_shipped",
    "date_card_received",
    "rfie_date",
    "biometrics_requested_date",
    "biometrics_completed_date",
    "pp_upgrade_date",
)

console = Console()

_SKIP_AUTHORS = frozenset({"automoderator", "[deleted]", "opttracker_bot"})
_SKIP_BODIES = frozenset({"[deleted]", "[removed]"})


def _build_record(comment: dict, thread: dict) -> dict | None:
    body: str = comment.get("body", "")
    author: str = comment.get("author", "")

    if not body or body in _SKIP_BODIES or author.lower() in _SKIP_AUTHORS:
        return None

    created_dt = datetime.fromtimestamp(
        comment.get("created_utc", 0), tz=timezone.utc
    )
    thread_year = thread.get("year")

    parsed = parse_comment(body, thread_year=thread_year, created_utc=created_dt)
    if not has_template_data(parsed):
        return None

    record = {
        "comment_id": comment["id"],
        "author": author,
        "created_utc": created_dt.isoformat(),
        "subreddit": thread["subreddit"],
        "permalink": f"https://reddit.com{comment.get('permalink', '')}",
        **parsed,
        "raw_text": body,
    }
    today_iso = date.today().isoformat()

    # Null out dates that are logically impossible (year typos)
    date_applied = record.get("date_applied")
    if date_applied:
        for field in ("biometrics_completed_date", "biometrics_requested_date", "rfie_date"):
            if record.get(field) and record[field] < date_applied:
                record[field] = None
        for field in ("date_approved", "date_card_produced", "date_card_shipped", "date_card_received"):
            if record.get(field) and record[field] < date_applied:
                record[field] = None

    # Null out future-dated downstream fields — these can't have happened yet.
    for field in _FUTURE_NULLABLE_FIELDS:
        v = record.get(field)
        if v and v > today_iso:
            record[field] = None

    record = compute_derived(record)

    # Drop records where date_applied is in the future — likely a typo
    if date_applied and date_applied > today_iso:
        return None

    return record


@click.command()
@click.option("--output", "-o", default=DEFAULT_OUTPUT, show_default=True, help="Output CSV path (CSV backend)")
@click.option("--no-merge", is_flag=True, default=False, help="Overwrite instead of merging with existing records")
@click.option("--csv", "force_csv", is_flag=True, default=False, help="Write to CSV even if Supabase env vars are set")
@click.option("--seed-from", "seed_from", default=None, help="Load existing records from this CSV instead of the active store (one-time Supabase migration seed)")
@click.option("--yes", "-y", "assume_yes", is_flag=True, default=False, help="Skip the confirmation prompt before writing to Supabase")
@click.option("--verbose", "-v", is_flag=True, default=False)
def cli(output: str, no_merge: bool, force_csv: bool, seed_from: str | None, assume_yes: bool, verbose: bool) -> None:
    """Scrape OPT/STEM OPT processing timelines and save to Supabase or CSV."""
    out_path = Path(output)
    sb_url, sb_key = supastore.supabase_config()
    use_supabase = bool(sb_url and sb_key) and not force_csv

    console.rule("[bold green]OPT Timeline Scraper[/bold green]")
    if use_supabase:
        console.print(f"Store → [cyan]Supabase[/cyan] [dim]{sb_url}[/dim]")
    else:
        console.print(f"Store → [cyan]CSV[/cyan] → {out_path}")

    if no_merge:
        existing = {}
    elif seed_from:
        existing = load_existing(Path(seed_from))
        console.print(f"Seed: loaded [bold]{len(existing)}[/bold] existing from {seed_from}")
    elif use_supabase:
        existing = supastore.load_existing(sb_url, sb_key)
    else:
        existing = load_existing(out_path)
    if existing and not seed_from:
        console.print(f"Loaded [bold]{len(existing)}[/bold] existing records")

    all_fresh: list[dict] = []
    failed_threads: list[str] = []

    with httpx.Client() as client:
        for i, thread in enumerate(THREADS):
            sub = thread["subreddit"]
            post_id = thread["post_id"]
            if i > 0:
                console.print(f"[dim]Waiting {REQUEST_DELAY:.0f}s before next thread…[/dim]")
                time.sleep(REQUEST_DELAY)
            console.print(f"\n[bold]Fetching r/{sub} ({post_id})…[/bold]")
            seen = parsed = 0

            with Progress(SpinnerColumn(), TextColumn("{task.description}"), console=console) as prog:
                task = prog.add_task("Starting…", total=None)
                try:
                    for comment in fetch_all_comments(thread, client):
                        seen += 1
                        prog.update(task, description=f"Comments fetched: {seen}")
                        rec = _build_record(comment, thread)
                        if rec:
                            parsed += 1
                            all_fresh.append(rec)
                            if verbose:
                                console.print(
                                    f"  ✓ [{rec.get('normalized_type')}] "
                                    f"{rec.get('date_applied')} → {rec.get('date_approved')}"
                                )
                    prog.update(task, description=f"Done — {seen} comments, {parsed} matched template")
                except Exception:
                    console.print(f"[bold yellow]⚠ Error fetching r/{sub} ({post_id}) — skipping.[/bold yellow]")
                    traceback.print_exc()
                    failed_threads.append(post_id)

    if failed_threads:
        console.print(f"\n[bold yellow]⚠ Skipped threads: {', '.join(failed_threads)}[/bold yellow]")

    if not all_fresh and not existing:
        console.print("[bold red]No data collected — nothing to save.[/bold red]")
        raise SystemExit(1)

    # Summary table
    tbl = Table(show_header=True, header_style="bold magenta")
    tbl.add_column("Metric")
    tbl.add_column("Value", justify="right")
    tbl.add_row("Fresh records parsed", str(len(all_fresh)))
    tbl.add_row("Existing records", str(len(existing)))
    merged = merge(existing, all_fresh)
    tbl.add_row("After merge", str(len(merged)))
    final = dedupe_by_author_date(merged)
    tbl.add_row("After dedupe (author+date_applied)", str(len(final)))
    console.print(tbl)

    if use_supabase:
        final_by_id = {r["comment_id"]: r for r in final if r.get("comment_id")}
        final_ids = set(final_by_id)
        new = sum(1 for cid in final_ids if cid not in existing)
        updated = sum(
            1 for cid in final_ids
            if cid in existing
            and final_by_id[cid].get("raw_text") != existing[cid].get("raw_text")
        )
        unchanged = len(final_ids) - new - updated
        stale = sum(1 for cid in existing if cid not in final_ids)
        console.print(
            f"\nSupabase changes: [green]+{new} new[/green], "
            f"[cyan]~{updated} updated[/cyan], "
            f"{unchanged} unchanged, "
            f"[red]-{stale} stale removed[/red]"
        )
        # Auto-proceed when non-interactive (CI) or --yes; otherwise prompt.
        if not assume_yes and sys.stdin.isatty():
            if not click.confirm("Write these changes to Supabase?", default=False):
                console.print("[yellow]Aborted — nothing written to Supabase.[/yellow]")
                return
        supastore.save(final, sb_url, sb_key)
        console.print(f"\n[bold green]✓ Upserted {len(final)} records → Supabase[/bold green]")
    else:
        save(final, out_path)
        console.print(f"\n[bold green]✓ Saved {len(final)} records → {out_path}[/bold green]")
        meta_path = out_path.with_name("meta.json")
        meta_path.write_text(
            json.dumps({"scraped_at": datetime.now(tz=timezone.utc).isoformat()}) + "\n"
        )
        console.print(f"[dim]Meta → {meta_path}[/dim]")
