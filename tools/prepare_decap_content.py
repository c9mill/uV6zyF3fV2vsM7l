"""Create the initial Decap content files from the current migrated site.

This is a one-time, repeatable migration helper.  It intentionally reads the
already generated pages, because those pages contain the cleaned local image
URLs and the editorial HTML that is currently visible to visitors.
"""
from __future__ import annotations

from datetime import datetime
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup
import yaml


ROOT = Path(__file__).resolve().parents[1]
LEGACY_ROOT = ROOT.parent / "fkbad_migrator" / "fkbad_export_lean"
EXPORT = LEGACY_ROOT / "backend"
DIST = ROOT / "dist"
CONTENT = ROOT / "src" / "content"

ROUTE_OVERRIDES = {
    308: "/",
    625: "/",
    307: "/новини/",
    592: "/про-коледж/",
    593: "/вступнику/",
    594: "/студенту/",
}
CODE_CONTROLLED_PAGE_IDS = {308, 625, 307, 592, 593, 594, 1133}


def read_json(name: str):
    return json.loads((EXPORT / name).read_text(encoding="utf-8"))


def clean_text(value: str) -> str:
    soup = BeautifulSoup(value or "", "html.parser")
    for node in soup(["style", "script"]):
        node.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def route_for(entry: dict) -> str:
    if entry["id"] in ROUTE_OVERRIDES:
        return ROUTE_OVERRIDES[entry["id"]]
    return unquote(urlparse(entry["link"]).path).rstrip("/") + "/"


def source_title(entry: dict) -> str:
    title = clean_text(entry.get("title", {}).get("rendered", ""))
    if title:
        return title.capitalize() if title.isupper() else title
    source = BeautifulSoup(entry.get("content", {}).get("rendered", ""), "html.parser")
    heading = source.find(re.compile(r"^h[1-6]$"))
    if heading:
        return clean_text(str(heading))
    return unquote(entry.get("slug", "")).replace("-", " ").strip().capitalize()


def output_page(route: str) -> Path:
    relative = route.strip("/")
    return DIST / relative / "index.html" if relative else DIST / "index.html"


def inner_html(node) -> str:
    return "".join(str(child) for child in node.contents).strip() if node else ""


def frontmatter(metadata: dict, body: str) -> str:
    header = yaml.safe_dump(
        metadata,
        allow_unicode=True,
        sort_keys=False,
        width=120,
    ).strip()
    return f"---\n{header}\n---\n{body.strip()}\n"


def migrate_news(posts: list[dict]) -> None:
    target = CONTENT / "news"
    target.mkdir(parents=True, exist_ok=True)
    for entry in posts:
        route = route_for(entry)
        built = output_page(route)
        soup = BeautifulSoup(built.read_text(encoding="utf-8"), "html.parser") if built.is_file() else None
        article = soup.select_one(".article-prose") if soup else None
        hero = soup.select_one(".article-hero[src]") if soup else None
        first_image = article.select_one("img[src]") if article else None
        category = "Життя коледжу"
        meta_labels = soup.select(".article-meta span") if soup else []
        if meta_labels:
            category = clean_text(str(meta_labels[0])) or category
        metadata = {
            "title": source_title(entry),
            "date": entry.get("date") or datetime.now().isoformat(timespec="minutes"),
            "slug": unquote(entry.get("slug", "")),
            "route": route,
            "legacy_url": unescape(entry.get("link", "")),
            "legacy_id": entry["id"],
            "category": category,
            "featured_image": (hero or first_image).get("src", "") if (hero or first_image) else "",
            "excerpt": "",
            "published": entry.get("status") == "publish",
        }
        body = inner_html(article) or entry.get("content", {}).get("rendered", "")
        (target / f"{entry['id']}.md").write_text(frontmatter(metadata, body), encoding="utf-8")


def migrate_pages(pages: list[dict]) -> None:
    target = CONTENT / "pages"
    target.mkdir(parents=True, exist_ok=True)
    for entry in pages:
        if entry["id"] in CODE_CONTROLLED_PAGE_IDS:
            continue
        route = route_for(entry)
        built = output_page(route)
        soup = BeautifulSoup(built.read_text(encoding="utf-8"), "html.parser") if built.is_file() else None
        prose = soup.select_one("main .prose") if soup else None
        heading = soup.select_one(".page-heading h1") if soup else None
        metadata = {
            "title": clean_text(str(heading)) if heading else source_title(entry),
            "route": route,
            "legacy_url": unescape(entry.get("link", "")),
            "legacy_id": entry["id"],
            "published": entry.get("status") == "publish",
        }
        body = inner_html(prose) or entry.get("content", {}).get("rendered", "")
        (target / f"{entry['id']}.md").write_text(frontmatter(metadata, body), encoding="utf-8")


def compact_menu(items: list[dict]) -> list[dict]:
    """Keep only the menu fields used by the generator."""
    result = []
    for item in items:
        children = item.get("children")
        result.append(
            {
                "label": item.get("label", ""),
                "url": item.get("url", ""),
                "children": compact_menu(children) if isinstance(children, list) else [],
            }
        )
    return result


def migrate_menu() -> None:
    source = LEGACY_ROOT / "menus.json"
    if not source.is_file():
        return
    menus = json.loads(source.read_text(encoding="utf-8"))
    tree = menus[0].get("tree", []) if menus else []
    target = CONTENT / "navigation-source.json"
    target.write_text(
        json.dumps(compact_menu(tree), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    if not EXPORT.is_dir():
        raise SystemExit(f"Content export was not found: {EXPORT}")
    migrate_news(read_json("posts.json"))
    migrate_pages(read_json("pages.json"))
    migrate_menu()
    print("Prepared Decap content: news, pages and navigation")


if __name__ == "__main__":
    main()
