# NOTICE

## Kuro Games

Wuthering Waves, karakter Aemeath, dan nama serta latar terkait adalah milik
Kuro Games. Proyek ini adalah karya penggemar tidak resmi, tidak berafiliasi
dengan Kuro Games, dan hanya untuk penggunaan non-komersial.

## Lisensi per bagian

| Bagian | Lisensi |
|---|---|
| Kode proyek | PolyForm Noncommercial 1.0.0 (`LICENSE`) |
| `assets/pet/` | MIT, cuNuo (bagian di bawah) |
| `lorebook/` | CC BY-SA, Wuthering Waves Wiki (bagian Lorebook di bawah) |
| `assets/icon.png` | Disediakan pemilik proyek; sumber dan hak ciptanya belum dicatat |

Teks CC BY-SA tidak boleh dibatasi non-komersial, jadi `lorebook/` dikecualikan
dari lisensi kode dan tetap CC BY-SA.

## Sprite Aemeath Mini

`assets/pet/spritesheet.webp` dan `assets/pet/pet.json` diambil dari pet "Aemeath Mini"
karya cuNuo:

- Halaman pet: https://q.dog/pets/aemeath-mini--cunuo
- Sumber: https://github.com/cuNuo/aemeath-mini-codex-pet (direktori `dist/`)
- Cermin komunitas: https://github.com/burgleaf/qdog-community/tree/main/pets/aemeath-mini--cunuo

Lisensi aset: MIT License (teks lengkap di bawah).

Basis pixel art: lzy-buaa-jdi/ameath (MIT), disusun ulang oleh cuNuo menjadi atlas
Codex 8 kolom x 9 baris dengan sel 192x208 px. `assets/pet/atlas.json` berisi
pemetaan baris/frame yang sama dengan `dist/validation.json` milik pembuat aset.

Aemeath dan Wuthering Waves adalah milik pemegang haknya (Kuro Games). Aset ini
adalah karya fan tidak resmi; proyek ini tidak berafiliasi dengan Kuro Games.

## MIT License

Copyright (c) cuNuo
Pixel art base: lzy-buaa-jdi/ameath

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Lorebook

The trivia in `lorebook/` is paraphrased from the Wuthering Waves Wiki on Fandom
(https://wutheringwaves.fandom.com), whose community content is available under
CC BY-SA unless otherwise noted. Each entry names its source page, and the
paraphrases are shared under the same license. See `lorebook/README.md` and
`lorebook/sources.json`. Wuthering Waves and its characters belong to Kuro
Games; this is an unofficial fan project.

## Web search

When the optional web search is switched on, short excerpts are fetched at run time
from the Wuthering Waves Wiki on Fandom and from Wikipedia. Both publish their text
under CC BY-SA; each answer that uses an excerpt shows its source page. Excerpts are
not stored.

In companion mode (`/change-mode-search`), coding questions may also fetch an accepted
answer from Stack Overflow (via the Stack Exchange API) and cooking questions a recipe
excerpt from the Wikibooks Cookbook (https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents).
Stack Overflow user contributions and Wikibooks text are licensed under CC BY-SA; each
answer that uses an excerpt links to its source page, and excerpts are not stored.
