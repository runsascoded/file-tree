# OG card fonts

resvg (SVG → PNG in the Worker) has no system fonts, so these are the only glyphs the `/og/*` cards can draw. Imported as `ArrayBuffer`s (the `Data` rule in `../wrangler.toml`) and handed to resvg in `../src/og.ts`.

| File | Family | Weight | Used for |
| --- | --- | --- | --- |
| `Inter-400.ttf` | Inter | 400 | fallback (default family) |
| `Inter-700.ttf` | Inter | 700 | card title |
| `JetBrainsMono-400.ttf` | JetBrains Mono | 400 | header, meta line, sizes, brand |
| `JetBrainsMono-600.ttf` | JetBrains Mono | 600 | treemap tile names |

Latin subsets (~40–50 KB each, ~180 KB total / ~90 KB gzipped): Basic Latin + Latin-1 + a few typographic marks (– — ‘ ’ “ ” • … ←↑→↓). A path with characters outside that set renders them as blanks — widen `U` below and re-run if that matters.

Both are SIL OFL 1.1 (`Inter-OFL.txt`, `JetBrainsMono-OFL.txt`). Sources are Google Fonts' static TTFs (`fonts.googleapis.com/css2?family=Inter:wght@400;700&family=JetBrains+Mono:wght@400;600`, fetched with a non-browser UA so it links `.ttf`), subset with fonttools:

```bash
U="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2190-2193"
uvx --from fonttools pyftsubset Inter-400.ttf --unicodes="$U" --layout-features='kern,liga,calt' --no-hinting --output-file=fonts/Inter-400.ttf
# …same for the other three
```
