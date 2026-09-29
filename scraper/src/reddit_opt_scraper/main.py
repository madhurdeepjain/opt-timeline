"""CLI entry-point: `uv run scrape`"""

import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import click
import httpx
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from . import supastore
from .config import THREADS, IGNORED_THREADS, DEFAULT_OUTPUT, REQUEST_DELAY
from .fetcher import fetch_all_comments, find_new_megathreads, is_gone, lookup_comments
from .parser import parse_comment, has_template_data, validate_dates
from .exporter import ANON_PREFIX, load_existing, merge, merge_by_author, save

# Load credentials from a local .env (Supabase + Reddit auth) if present.
# In CI these come from the environment/secrets, so a missing file is fine.
load_dotenv()

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
    # Last time the author touched this comment: an edit means they reported
    # their status as of that moment, so it bounds every date in the text.
    edited = comment.get("edited")
    last_seen_dt = created_dt
    if isinstance(edited, (int, float)) and not isinstance(edited, bool) and edited > created_dt.timestamp():
        last_seen_dt = datetime.fromtimestamp(edited, tz=timezone.utc)

    parsed = parse_comment(body, as_of=last_seen_dt)
    if not has_template_data(parsed):
        return None

    record = {
        "comment_id": comment["id"],
        "author": author,
        "created_utc": created_dt.isoformat(),
        "last_seen_utc": last_seen_dt.isoformat(),
        "subreddit": thread["subreddit"],
        "permalink": f"https://reddit.com{comment.get('permalink', '')}",
        **parsed,
        "raw_text": body,
    }
    return validate_dates(record, last_seen_dt)


def _check_threads() -> None:
    """Print candidate megathreads (one Markdown bullet each); nothing if none."""
    subreddits = sorted({t["subreddit"] for t in THREADS})
    known = {t["post_id"] for t in THREADS} | IGNORED_THREADS
    with httpx.Client() as client:
        found = find_new_megathreads(
            client,
            subreddits,
            known,
            cookie=os.environ.get("REDDIT_COOKIE") or None,
            token=os.environ.get("REDDIT_TOKEN") or None,
        )
    for t in found:
        print(f"- [r/{t['subreddit']}: {t['title']}]({t['url']}) · `{t['post_id']}` · {t['num_comments']} comments")


@click.command()
@click.option("--output", "-o", default=DEFAULT_OUTPUT, show_default=True, help="Output CSV path (CSV backend)")
@click.option("--no-merge", is_flag=True, default=False, help="Overwrite instead of merging with existing records")
@click.option("--csv", "force_csv", is_flag=True, default=False, help="Write to CSV even if Supabase env vars are set")
@click.option("--yes", "-y", "assume_yes", is_flag=True, default=False, help="Skip the confirmation prompt before writing to Supabase")
@click.option("--check-threads", is_flag=True, default=False, help="Only list OPT timeline megathreads missing from config.THREADS, as Markdown")
@click.option("--verbose", "-v", is_flag=True, default=False)
def cli(output: str, no_merge: bool, force_csv: bool, assume_yes: bool, check_threads: bool, verbose: bool) -> None:
    """Scrape OPT/STEM OPT processing timelines and save to Supabase or CSV."""
    if check_threads:
        _check_threads()
        return

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
    elif use_supabase:
        existing = supastore.load_existing(sb_url, sb_key)
    else:
        existing = load_existing(out_path)
    if existing:
        console.print(f"Loaded [bold]{len(existing)}[/bold] existing records")

    all_fresh: list[dict] = []
    fetched: set[str] = set()  # every top-level comment id Reddit returned
    gone: set[str] = set()     # confirmed deleted/removed (comment or account)
    failed_threads: list[str] = []

    reddit_cookie = os.environ.get("REDDIT_COOKIE") or None
    reddit_token = os.environ.get("REDDIT_TOKEN") or None
    if reddit_token:
        console.print("Auth → [cyan]bearer token[/cyan] (oauth.reddit.com)")
    elif reddit_cookie:
        console.print("Auth → [cyan]session cookie[/cyan] (www.reddit.com)")
    else:
        console.print("[yellow]⚠ No REDDIT_COOKIE or REDDIT_TOKEN set — requests may 403[/yellow]")

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
                    for comment in fetch_all_comments(thread, client, cookie=reddit_cookie, token=reddit_token):
                        seen += 1
                        fetched.add(comment["id"])
                        if is_gone(comment):
                            gone.add(comment["id"])
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

        # Stored rows whose comment didn't come back: ask Reddit about each one.
        # Only a positive "deleted/removed" answer de-links a row; a failed fetch
        # or lookup leaves it as it is.
        unseen = [cid for cid in existing if cid not in fetched and not cid.startswith(ANON_PREFIX)]
        if unseen:
            console.print(f"\nChecking {len(unseen)} stored comments that weren't fetched…")
            found = lookup_comments(client, unseen, cookie=reddit_cookie, token=reddit_token)
            gone |= {cid for cid, c in found.items() if is_gone(c)}

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
    final = merge_by_author(merged, frozenset(gone))
    tbl.add_row("After merging each author's posts", str(len(final)))
    anon_before = sum(1 for cid in existing if cid.startswith(ANON_PREFIX))
    anon_after = sum(1 for r in final if r["comment_id"].startswith(ANON_PREFIX))
    tbl.add_row("De-linked (deleted on Reddit)", f"{anon_after} ({anon_after - anon_before:+d})")
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
