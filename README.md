# aemeath-ai-agent

Desktop pet Aemeath: berjalan di atas desktop, bereaksi terhadap aktivitas Anda, dan
memantau sesi AI Claude yang sedang berjalan.

## Fitur

- Berjalan-jalan di area kerja desktop, berhenti iseng, bisa digeser, dan diubah
  ukurannya (Ctrl+scroll atau menu tray).
- Klik Aemeath untuk membuatnya melompat; klik kanan untuk menu.
- Musik: mengikuti media session Windows dan menampilkan judul lagu di gelembung kecil.
- Sesi AI: membaca transkrip Claude Code di `~/.claude/projects`; saat sesi selesai
  Aemeath menampilkan ringkasan hasilnya, saat gagal animasi `failed` dengan pesan error.
- Tray: skala, kecepatan jalan, deteksi musik, pemantau sesi, reset posisi, keluar.

Pengaturan (skala, kecepatan, posisi) disimpan di user data aplikasi, bukan di repo.

## Menjalankan

Butuh Node.js 20+.

```powershell
npm install
npm start
```

## Test

```powershell
npm test
```

## Struktur

| Jalur | Isi |
|---|---|
| `main.js` | proses utama Electron: jendela overlay transparan, tray, watcher |
| `renderer/` | animasi sprite, bubble dialog, drag & resize |
| `src/` | atlas, walker, parser sesi, provider Claude Code, deteksi musik, settings |
| `assets/pet/` | spritesheet + atlas (sumber & lisensi di `NOTICE.md`) |
| `lorebook/` | trivia lore berkredit sumber (lihat `lorebook/README.md`) |
| `tests/` | unit test atlas, walker, parser, dan provider |

Status: tahap awal (prototipe).

## Lisensi

Kode proyek ini dibagikan dengan sumber terbuka di bawah
[PolyForm Noncommercial 1.0.0](LICENSE): boleh dipakai, dipelajari, diubah, dan
dibagikan ulang untuk keperluan **non-komersial**; penggunaan komersial tidak
diizinkan. Perlu diketahui, syarat non-komersial berarti proyek ini tergolong
*source-available*, bukan "open source" menurut definisi OSI.

Bagian lain memakai lisensinya sendiri:

| Bagian | Lisensi |
|---|---|
| Kode (di luar tabel ini) | PolyForm Noncommercial 1.0.0 |
| `assets/pet/` (sprite Aemeath Mini oleh cuNuo) | MIT |
| `lorebook/` (parafrasa Wuthering Waves Wiki) | CC BY-SA |

## Kredit

- **Wuthering Waves**, karakter **Aemeath**, serta nama dan latar terkait adalah
  milik **Kuro Games**. Proyek ini adalah karya penggemar tidak resmi: tidak
  berafiliasi dengan, disponsori, atau didukung oleh Kuro Games, dan dibuat tanpa
  tujuan komersial.
- Sprite *Aemeath Mini* oleh [cuNuo](https://github.com/cuNuo/aemeath-mini-codex-pet)
  (MIT), berbasis pixel art lzy-buaa-jdi/ameath.
- Trivia di `lorebook/` diparafrasa dari
  [Wuthering Waves Wiki](https://wutheringwaves.fandom.com) di Fandom (CC BY-SA);
  setiap entri menyebut halaman sumbernya.

Rincian atribusi dan teks lisensi ada di [NOTICE.md](NOTICE.md).
