"""
Autoškola Zavřel: jednoduchý statický build bez závislostí.

Zdroje:   src/partials/*.html  (layout, header, footer)
          src/pages/*.html     (obsah stránek, na prvním řádku JSON metadata v HTML komentáři)
Výstup:   *.html v kořeni projektu (to se nasazuje)

Spuštění: python build.py
"""
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
SITE = "https://www.ridicak.info"

# Ikony (Lucide styl, 24x24, stroke). Vkládají se tokenem {{icon:nazev}}
ICONS = {
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "arrow-up-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "phone": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    "mail": '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "calendar": '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "wallet": '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    "monitor": '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    "headphones": '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "award": '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
    "graduation": '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    "route": '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    "rotate": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    "briefcase": '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    "alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    "gauge": '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "moon": '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    "building": '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    "signpost": '<path d="M12 13v8M12 3v3"/><path d="M4 6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h13a2 2 0 0 0 1.15-.37l3.43-2.31a1 1 0 0 0 0-1.64l-3.43-2.31A2 2 0 0 0 17 6z"/>',
    "key": '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    "car": '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    "heart-pulse": '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    "ban": '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    "book": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "landmark": '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/><path d="m12 2 8 5H4z"/>',
    "steering": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5"/><path d="M12 14.5V22M9.6 11.4 2.3 9.8M14.4 11.4l7.3-1.6"/>',
    "film": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>',
    "sliders": '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    "repeat": '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "clipboard": '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    "printer": '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect width="12" height="8" x="6" y="14" rx="1"/>',
    "stethoscope": '<path d="M11 2v2M5 2v2M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
    "sparkle": '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    "plus": '<path d="M5 12h14M12 5v14"/>',
}

# Značka: oranžový volant s písmenem Z
LOGO_MARK = (
    '<g fill="none" stroke="#FF8114" stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="24" cy="24" r="19.5" stroke-width="4.2"/>'
    '<circle cx="24" cy="25" r="8.8" stroke-width="2.8"/>'
    '<path d="M6.5 22.2 15.4 24.2M41.5 22.2 32.6 24.2M24 33.8V41.5" stroke-width="3.4"/>'
    '<path d="M20.4 21.3h7.2l-7.2 7.4h7.2" stroke-width="2.5"/>'
    '</g>'
)
_logo_count = 0


def logo() -> str:
    global _logo_count
    _logo_count += 1
    return f'<svg class="brand__mark" viewBox="0 0 48 48" aria-hidden="true">{LOGO_MARK}</svg>'


def icon(name: str, cls: str = "i") -> str:
    if name not in ICONS:
        sys.exit(f"Neznámá ikona: {name}")
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'


def render_tokens(text: str) -> str:
    text = re.sub(r"\{\{icon:([a-z-]+)\}\}", lambda m: icon(m.group(1)), text)
    while "{{logo}}" in text:
        text = text.replace("{{logo}}", logo(), 1)
    return text


def visible_text(doc: str) -> str:
    head = re.search(r"<head>.*?</head>", doc, re.S)
    meta_text = ""
    if head:
        found = re.findall(r'<title>(.*?)</title>|name="description" content="([^"]*)"', head.group(0))
        meta_text = " ".join(part for pair in found for part in pair)
        doc = doc.replace(head.group(0), " ")
    doc = re.sub(r"<(script|style|svg)\b.*?</\1>", " ", doc, flags=re.S | re.I)
    doc = re.sub(r"<!--.*?-->", " ", doc, flags=re.S)
    attrs = meta_text + " " + " ".join(re.findall(r'\s(?:alt|title|aria-label|placeholder)="([^"]*)"', doc))
    doc = re.sub(r"<[^>]+>", " ", doc)
    return html.unescape(doc + " " + attrs)


def main() -> None:
    partials = {p.stem: p.read_text(encoding="utf-8") for p in (SRC / "partials").glob("*.html")}
    layout = partials["layout"]
    problems = []
    built = []

    for page in sorted((SRC / "pages").glob("*.html")):
        raw = page.read_text(encoding="utf-8")
        m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*", raw, re.S)
        if not m:
            sys.exit(f"Chybí metadata v {page.name}")
        meta = json.loads(m.group(1))
        body = raw[m.end():]
        slug = page.stem
        canonical = "" if slug == "index" else slug

        header = partials["header"]
        if meta.get("nav"):
            header = header.replace(f'data-nav-key="{meta["nav"]}"', f'data-nav-key="{meta["nav"]}" data-current')
        header = header.replace(f'data-page="{slug}"', f'data-page="{slug}" aria-current="page"')

        out = (
            layout.replace("{{header}}", header)
            .replace("{{footer}}", partials["footer"])
            .replace("{{content}}", body)
            .replace("{{title}}", html.escape(meta["title"]))
            .replace("{{description}}", html.escape(meta["description"]))
            .replace("{{canonical}}", f"{SITE}/{canonical}")
            .replace("{{slug}}", slug)
            .replace("{{theme}}", meta.get("theme", "dark"))
            .replace("{{head_extra}}", meta.get("head_extra", ""))
        )
        out = render_tokens(out)

        leftovers = re.findall(r"\{\{[^}]+\}\}", out)
        if leftovers:
            problems.append(f"{slug}: nevyplněné tokeny {set(leftovers)}")

        # Kontrola: v textech nesmí být pomlčky
        text = visible_text(out)
        for hit in re.finditer(r".{0,30}(?:[‒–—―]|\s-\s|\w-\w).{0,30}", text):
            problems.append(f"{slug}: pomlčka v textu -> {hit.group(0).strip()!r}")

        (ROOT / f"{slug}.html").write_text(out, encoding="utf-8")
        built.append(slug)

    # sitemap
    urls = "\n".join(
        f"  <url><loc>{SITE}/{'' if s == 'index' else s}</loc></url>" for s in built
    )
    (ROOT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n',
        encoding="utf-8",
    )

    print(f"Hotovo: {len(built)} stránek -> {', '.join(built)}")
    if problems:
        print("\nUpozornění:")
        for p in problems:
            print("  ", p)
        sys.exit(1)


if __name__ == "__main__":
    main()
