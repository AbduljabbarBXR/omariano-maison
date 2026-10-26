#!/usr/bin/env python3
"""
Build the Omariano Maison static catalogue from the September 2026 cPanel backup.

Inputs (not committed):
  --catalog   parsed catalog.json (products/categories/brands/uploads)
  --covers    directory containing the extracted uploads/all files
  --maps      primary-map.json mapping product id -> uploaded cover file

Outputs:
  data/products.json
  data/site.json
  assets/covers/*.webp
  assets/logo.png, logo-light.png, favicon.png
  assets/og.jpg
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]

# Curated lists (product ids from the live catalogue).
HERO = [255, 22, 23]            # Sealed Nectar / Girl, Your Goal is Jannah / Lost Islamic History
EDIT = [257, 22, 23, 74, 342, 220, 232, 280]
PICKS = [255, 23, 74, 208]
KIDS = [162, 172, 171, 177]

COLLECTIONS = {
    "quran": {
        "label": "Qur'an",
        "blurb": "Translations, tafsir and tracing editions for a deeper read.",
        "cover": 220,
    },
    "children": {
        "label": "Children's Library",
        "blurb": "Stories, workbooks and first libraries for young readers.",
        "cover": 162,
    },
    "adult": {
        "label": "Adult Books",
        "blurb": "Seerah, theology, spirituality and the life of the mind.",
        "cover": 22,
    },
    "business": {
        "label": "Business & Self-Help",
        "blurb": "Habits, leadership and work that lasts.",
        "cover": 61,
    },
    "fiction": {
        "label": "Fiction",
        "blurb": "Novels and voices from near and far.",
        "cover": 342,
    },
    "essentials": {
        "label": "Islamic Essentials",
        "blurb": "Oils, reading stands and quiet tools for daily practice.",
        "cover": 280,
    },
}

CAT_GROUP = {
    48: "adult",
    49: "adult",
    50: "children",
    53: "children",
    54: "children",
    55: "children",
    56: "children",
    57: "quran",
    51: "business",
    52: "fiction",
    59: "essentials",
    60: "essentials",
}

CAT_LABEL = {
    48: "Islamic Books",
    49: "Adult Books",
    50: "Children",
    53: "Children · Ages 0–6",
    54: "Children · Ages 7–8",
    55: "Children · Ages 9–12",
    56: "Children · Teens",
    57: "Qur'an",
    51: "Business & Self-Help",
    52: "Fiction",
    59: "Islamic Essentials",
    60: "Games",
}


def clean_inline(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clean_description(value: Any) -> str:
    if not value:
        return ""
    text = str(value)
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(p|div|li|h[1-6])>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = text.replace("\r", "\n").replace("\u00a0", " ").replace("\u200b", "")
    lines = []
    for line in text.split("\n"):
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            lines.append(line)
    text = "\n\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def split_name(name: str) -> tuple[str, str]:
    match = re.search(r"\s+by\s+(.+)$", name, flags=re.I)
    if not match:
        return name.strip(), ""
    title = name[: match.start()].strip()
    author = match.group(1).strip()
    if len(title) < 3 or len(author) > 90:
        return name.strip(), ""
    return title, author


def trim_blurb(text: str, limit: int = 150) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    cut = cut[: cut.rfind(" ")] if " " in cut else cut
    return cut.rstrip(" ,.;:") + "…"


def money(value: int) -> str:
    return f"{value:,}"


def cover_path(pid: int) -> str:
    return f"assets/covers/{pid}.webp"


def load_font(path: Path, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(path), size)
    if weight is not None:
        try:
            font.set_variation_by_axes([weight])
        except Exception:
            pass
    return font


def make_logo(src: Path, assets: Path) -> None:
    logo = Image.open(src).convert("RGBA")
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)

    # Header logo, resized to a comfortable 2x width.
    width = 620
    height = round(logo.height * width / logo.width)
    small = logo.resize((width, height), Image.LANCZOS)
    small.save(assets / "logo.png", optimize=True)

    # Light version for dark backgrounds: blue ink becomes warm cream, gold survives.
    light = small.copy()
    pixels = light.load()
    for y in range(light.height):
        for x in range(light.width):
            r, g, b, a = pixels[x, y]
            if a and b > r * 1.18 and b > g * 1.05:
                pixels[x, y] = (247, 242, 232, a)
    light.save(assets / "logo-light.png", optimize=True)

    # Favicon: the round mosque mark at the left of the lockup.
    mark = logo.crop((0, 0, min(logo.width, logo.height), logo.height))
    mark.thumbnail((128, 128), Image.LANCZOS)
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.paste(mark, ((128 - mark.width) // 2, (128 - mark.height) // 2), mark)
    canvas.save(assets / "favicon.png", optimize=True)


def make_og(covers: dict[int, Path], fonts: Path, assets: Path) -> None:
    W, H = 1200, 630
    bg = Image.new("RGB", (W, H), "#FAF5EC")
    draw = ImageDraw.Draw(bg)

    # Hairline frame
    draw.rectangle((28, 28, W - 29, H - 29), outline="#D9C8A8", width=2)

    logo = Image.open(assets / "logo.png").convert("RGBA")
    lw = 330
    lh = round(logo.height * lw / logo.width)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    bg.paste(logo, (72, 64), logo)

    serif = load_font(fonts / "Cormorant.ttf", 76, 600)
    italic = load_font(fonts / "Cormorant-Italic.ttf", 76, 500)
    sans = load_font(fonts / "Manrope.ttf", 19, 600)
    sans_small = load_font(fonts / "Manrope.ttf", 15, 500)

    draw.text((74, 190), "A HOUSE OF BOOKS · NAIROBI", font=sans_small, fill="#A77B32")
    draw.text((72, 222), "A house of books", font=serif, fill="#14213D")
    draw.text((72, 294), "for the life of the soul.", font=italic, fill="#1B4FA0")
    draw.text(
        (74, 404),
        "Islamic thought, children's stories and literature —\nselected in South C and delivered across Kenya.",
        font=sans_small,
        fill="#5D5A52",
        spacing=8,
    )
    draw.line((74, 492, 600, 492), fill="#D9C8A8", width=2)
    draw.text((74, 512), "OMARIANO BOOKSTORE  ·  SOUTH C, NAIROBI", font=sans_small, fill="#A77B32")
    draw.text((74, 552), "omariano.com", font=sans, fill="#14213D")

    # Three framed covers on the right.
    ids = [255, 230, 257]
    base_x, base_y = 730, 128
    offsets = [(0, 18, -4), (108, 0, 0), (216, 24, 4)]
    sizes = [(200, 286), (220, 314), (200, 286)]
    for pid, (dx, dy, angle), (cw, ch) in zip(ids, offsets, sizes):
        path = covers.get(pid)
        if not path or not path.exists():
            continue
        cover = Image.open(path).convert("RGB")
        cover.thumbnail((cw, ch), Image.LANCZOS)

        frame = Image.new("RGBA", (cover.width + 20, cover.height + 20), "#FFFFFF")
        frame.paste(cover, (10, 10))
        frame = frame.rotate(angle, expand=True, resample=Image.BICUBIC)

        shadow = Image.new("RGBA", (frame.width + 40, frame.height + 40), (0, 0, 0, 0))
        shadow.paste((20, 30, 50, 75), (20, 24, 20 + frame.width, 24 + frame.height))
        shadow = shadow.filter(ImageFilter.GaussianBlur(14))
        bg.paste(shadow, (base_x + dx - 10, base_y + dy - 6), shadow)
        bg.paste(frame, (base_x + dx, base_y + dy), frame)

    bg.save(assets / "og.jpg", quality=90, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="/tmp/opencode/omariano/catalog.json")
    parser.add_argument("--covers", default="/tmp/opencode/omariano/extracted/backup-9.20.2026_06-57-28_omariano/homedir/public_html/public/uploads/all")
    parser.add_argument("--maps", default="/tmp/opencode/omariano/primary-map.json")
    parser.add_argument("--fonts", default="/tmp/opencode/fonts")
    args = parser.parse_args()

    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    primary = {int(row["product"]): row["file"] for row in json.loads(Path(args.maps).read_text(encoding="utf-8"))}
    covers_dir = Path(args.covers)
    assets = ROOT / "assets"
    (assets / "covers").mkdir(parents=True, exist_ok=True)
    (ROOT / "data").mkdir(parents=True, exist_ok=True)

    cats = {c["id"]: c for c in catalog["categories"]}
    brands = {b["id"]: b for b in catalog["brands"]}

    published = [
        p for p in catalog["products"]
        if p["published"] == 1 and p["approved"] == 1 and not p["draft"]
    ]

    products = []
    new_rank = {
        p["id"]: i for i, p in enumerate(
            sorted(published, key=lambda p: str(p.get("created_at") or ""), reverse=True)
        )
    }

    for p in published:
        pid = int(p["id"])
        name = clean_inline(p["name"])
        title, author = split_name(name)
        if not title:
            title = name
        cat_id = int(p["category_id"])
        collection = CAT_GROUP.get(cat_id, "adult")
        category = CAT_LABEL.get(cat_id, (cats.get(cat_id) or {}).get("name") or "Books")
        brand = clean_inline((brands.get(p.get("brand_id")) or {}).get("name")) or "Omariano Selection"

        unit = int(round(float(p["unit_price"] or 0)))
        discount = int(round(float(p["discount"] or 0)))
        price = max(0, unit - discount)
        compare_at = unit if discount > 0 and price < unit else None

        description = clean_description(p.get("description"))
        if not description:
            description = (
                f"{title} is part of the {COLLECTIONS[collection]['label']} collection at "
                "Omariano Bookstore. Call or message the house for a closer look, availability "
                "or a personal recommendation."
            )
        if len(description) > 1400:
            description = description[:1400].rsplit(" ", 1)[0].rstrip(" ,.;:") + "…"

        stock = int(p.get("current_stock") or 0)
        created = str(p.get("created_at") or "")[:10]
        products.append({
            "id": pid,
            "slug": clean_inline(p.get("slug")),
            "title": title,
            "author": author,
            "name": name,
            "category": category,
            "collection": collection,
            "collectionLabel": COLLECTIONS[collection]["label"],
            "brand": brand,
            "price": price,
            "compareAt": compare_at,
            "save": discount if compare_at else 0,
            "image": cover_path(pid),
            "description": description,
            "blurb": trim_blurb(description),
            "stock": stock,
            "inStock": stock > 0,
            "lowStock": 0 < stock <= 3,
            "featured": bool(p.get("featured") == 1),
            "todaysDeal": bool(p.get("todays_deal") == 1),
            "sales": int(p.get("num_of_sale") or 0),
            "createdAt": created,
            "isNew": new_rank.get(pid, 999) < 12,
            "search": " ".join(
                [name, title, author, brand, category, COLLECTIONS[collection]["label"], clean_inline(p.get("tags"))]
            ).lower(),
        })

    products.sort(key=lambda p: (not p["featured"], -p["sales"], p["createdAt"], p["title"]))

    by_id = {p["id"]: p for p in products}
    for pid in [*HERO, *EDIT, *PICKS, *KIDS, *[c["cover"] for c in COLLECTIONS.values()]]:
        if pid not in by_id:
            raise SystemExit(f"Curated product {pid} is not published")

    # Optimise covers. Keep the original uploads out of the repo.
    missing = []
    for p in products:
        src_name = primary.get(p["id"])
        if not src_name:
            missing.append(p["id"])
            continue
        src = covers_dir / src_name
        if not src.exists():
            missing.append(p["id"])
            continue
        image = Image.open(src)
        if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
            image = image.convert("RGBA")
            flat = Image.new("RGB", image.size, "#FFFFFF")
            flat.paste(image, mask=image.split()[-1])
            image = flat
        else:
            image = image.convert("RGB")
        image.thumbnail((680, 680), Image.LANCZOS)
        image.save(assets / "covers" / f"{p['id']}.webp", "WEBP", quality=80, method=6)
    if missing:
        raise SystemExit(f"Missing cover files for: {missing}")

    # Site-level data.
    in_stock = [p for p in products if p["inStock"]]
    newest = sorted(in_stock, key=lambda p: p["createdAt"], reverse=True)[:8]
    collections = []
    for key, meta in COLLECTIONS.items():
        items = [p for p in products if p["collection"] == key]
        collections.append({
            "key": key,
            "label": meta["label"],
            "blurb": meta["blurb"],
            "count": len(items),
            "cover": cover_path(meta["cover"]),
        })

    site = {
        "updated": dt.date(2026, 10, 25).isoformat(),
        "total": len(products),
        "inStock": len(in_stock),
        "collections": collections,
        "hero": HERO,
        "edit": EDIT,
        "picks": PICKS,
        "children": KIDS,
        "new": [p["id"] for p in newest],
        "brands": sorted({p["brand"] for p in products}),
        "whatsapp": "254794677029",
        "phone": "+254 794 677 029",
        "email": "info@omariano.com",
        "address": "Salma Hotel Building, Ole Shapara Avenue, South C, Nairobi",
    }

    (ROOT / "data" / "products.json").write_text(
        json.dumps(products, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (ROOT / "data" / "site.json").write_text(
        json.dumps(site, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    make_logo(covers_dir / "OgBBFSnJyYzex7xIOrEEQ6KFGaCPuJeWTJCkK7vD.png", assets)
    make_og({pid: assets / "covers" / f"{pid}.webp" for pid in HERO}, Path(args.fonts), assets)

    size = sum((assets / "covers" / f"{p['id']}.webp").stat().st_size for p in products)
    print(f"products: {len(products)}  in stock: {len(in_stock)}")
    print(f"collections: " + ", ".join(f"{c['label']}={c['count']}" for c in collections))
    print(f"covers: {len(products)} files, {size / 1048576:.1f} MB")
    print(f"products.json: {(ROOT / 'data' / 'products.json').stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
