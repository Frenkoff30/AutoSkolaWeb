# Autoškola Zavřel, Hlinsko

Redesign webu www.ridicak.info. Statický web bez frameworku: HTML, CSS a čistý JavaScript.

## Struktura

| Cesta | Obsah |
| --- | --- |
| `src/partials/` | společný layout, hlavička a patička |
| `src/pages/` | obsah jednotlivých stránek (na prvním řádku metadata v JSON) |
| `build.py` | poskládá stránky do kořene projektu a zkontroluje texty |
| `*.html` | vygenerované stránky, tohle se nasazuje |
| `assets/css/style.css` | veškeré styly |
| `assets/js/main.js` | plynulý scroll, animace, menu, záložky, mini test |
| `assets/js/road.js` | interaktivní noční silnice v hero sekci |
| `assets/img/vehicles/` | optimalizované fotky výcvikových vozidel |
| `docs/` | dokumenty ke stažení |

## Úpravy

1. Uprav obsah v `src/pages/*.html` nebo společné části v `src/partials/`.
2. Spusť `python build.py`.
3. Build hlídá nevyplněné tokeny a pomlčky v textech. Když něco najde, vypíše to a skončí s chybou.

Ikony se vkládají tokenem `{{icon:nazev}}` (seznam v `build.py`), logo tokenem `{{logo}}`.

## Nasazení

Nasazuje se celý kořen projektu. `vercel.json` zapíná adresy bez přípony, takže původní URL jako `/cenik` nebo `/rp-b` fungují dál.

Soubory v `assets/` posílá Vercel s cache na 30 dní. Build proto ke každému odkazu na CSS, JS a obrázky přidá `?v=otisk obsahu`. Po každé úpravě stylů nebo skriptů je nutné spustit `python build.py`, jinak si prohlížeče (hlavně Safari na iPhonu) nechají staré verze.
