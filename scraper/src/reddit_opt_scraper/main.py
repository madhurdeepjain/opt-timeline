"""CLI entry-point: `uv run scrape`"""

import json
import time
import traceback
from datetime import date, datetime, timezone
from pathlib import Path

import click
import httpx
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from .config import THREADS, DEFAULT_OUTPUT, REQUEST_DELAY
from .fetcher import fetch_all_comments
from .parser import parse_comment, compute_derived, has_template_data
from .exporter import load_existing, merge, save

console = Console()

_SKIP_AUTHORS = frozenset({"automoderator", "[deleted]", "opttracker_bot"})
_SKIP_BODIES = frozenset({"[deleted]", "[removed]"})


def _build_record(comment: dict, thread: dict) -> dict | None:
    body: str = comment.get("body", "")
    author: str = comment.get("author", "")

    if not body or body in _SKIP_BODIES or author.lower() in _SKIP_AUTHORS:
        return None

    parsed = parse_comment(body)
    if not has_template_data(parsed):
        return None

    created_dt = datetime.fromtimestamp(
        comment.get("created_utc", 0), tz=timezone.utc
    ).isoformat()

    record = {
        "comment_id": comment["id"],
        "author": author,
        "created_utc": created_dt,
        "subreddit": thread["subreddit"],
        "permalink": f"https://reddit.com{comment.get('permalink', '')}",
        **parsed,
        # Truncate raw text to keep CSV manageable
        "raw_text": body[:600].replace("\n", " "),
    }
    record = compute_derived(record)

    # Drop records where date_applied is in the future — likely a typo
    date_applied = record.get("date_applied")
    if date_applied and date_applied > date.today().isoformat():
        return None

    return record


@click.command()
@click.option("--output", "-o", default=DEFAULT_OUTPUT, show_default=True, help="Output CSV path")
@click.option("--no-merge", is_flag=True, default=False, help="Overwrite instead of merging with existing CSV")
@click.option("--verbose", "-v", is_flag=True, default=False)
def cli(output: str, no_merge: bool, verbose: bool) -> None:
    """Scrape OPT/STEM OPT processing timelines from Reddit and save to CSV."""
    out_path = Path(output)
    console.rule("[bold green]OPT Timeline Scraper[/bold green]")
    console.print(f"Output → [cyan]{out_path}[/cyan]")

    existing = {} if no_merge else load_existing(out_path)
    if existing:
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
    tbl.add_row("Total after merge", str(len(merged)))
    console.print(tbl)

    save(merged, out_path)
    console.print(f"\n[bold green]✓ Saved {len(merged)} records → {out_path}[/bold green]")

    meta_path = out_path.with_name("meta.json")
    meta_path.write_text(
        json.dumps({"scraped_at": datetime.now(tz=timezone.utc).isoformat()}) + "\n"
    )
    console.print(f"[dim]Meta → {meta_path}[/dim]")
