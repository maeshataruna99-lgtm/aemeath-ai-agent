# aemeath-ai-agent

Desktop pet Aemeath: berjalan di atas desktop, bereaksi terhadap aktivitas Anda, dan
memantau sesi AI Claude yang sedang berjalan.

## Fitur

- Berjalan-jalan di area kerja desktop, berhenti iseng, bisa digeser, dan diubah
  ukurannya (Ctrl+scroll atau menu tray).
- Klik Aemeath untuk membuka kotak chat di sampingnya; klik kanan untuk menu.
- Musik: mengikuti media session Windows dan menampilkan judul lagu di gelembung kecil.
- Sesi AI: membaca transkrip Claude Code di `~/.claude/projects`; saat sesi selesai
  Aemeath menampilkan ringkasan hasilnya, saat gagal animasi `failed` dengan pesan error.
- Chatbot: ngobrol dengan Aemeath lewat API DeepSeek langsung di kotak chat yang muncul saat
  kamu mengeklik Aemeath (atau lewat menu tray "Ngobrol dengan Aemeath..."). Aemeath menjawab
  sebagai dirinya dan memakai lorebook sebagai pegangan untuk pertanyaan Wuthering Waves. Kunci API diatur di Pengaturan dan hanya disimpan
  terenkripsi di komputer ini, di luar folder proyek. Penyedia lain bisa ditambah lewat
  `src/chat/providers/`.
- Pencarian web (opsional, di Pengaturan): untuk pertanyaan informasi, Aemeath mencari dulu di
  Wuthering Waves Wiki (soal game) atau Wikipedia (topik lain), lalu menjawab dengan gayanya dan
  mencantumkan sumber. Ini pencarian ensiklopedia, bukan mesin pencari umum.
- Mode offline: tanpa API key atau tanpa internet, Aemeath tetap menjawab dari lorebook yang
  tersimpan. Kalau dia tidak tahu, dia menyuruhmu mencari di internet atau mengisi API key.
- Tray: skala, kecepatan jalan, deteksi musik, pemantau sesi, reset posisi, keluar.

Pengaturan (skala, kecepatan, posisi) disimpan di user data aplikasi, bukan di repo.

## Privasi chatbot

- Kunci API tidak pernah ada di repo, log, atau jendela selain Pengaturan. Aplikasi
  menyimpannya terenkripsi dengan penyimpanan kredensial Windows di folder data
  aplikasi, dan hanya proses utama yang bisa membacanya.
- Pesan yang kamu ketik di kotak chat dikirim ke penyedia yang dipilih (DeepSeek)
  untuk dijawab, bersama catatan lorebook sebagai bahan jawaban. Isi sesi AI, berkas, dan
  layarmu tidak ikut dikirim.
- Jika pencarian web dinyalakan, kata kunci pertanyaanmu dikirim ke Wuthering Waves Wiki
  (Fandom) atau Wikipedia, dan hasilnya ikut dikirim ke penyedia chatbot sebagai bahan
  jawaban. Pencarian mati secara bawaan.
- Riwayat percakapan hanya ada di memori dan dilupakan 10 menit setelah kotak chat ditutup.
- Pesan yang jelas tidak pantas disaring di komputer dan tidak pernah dikirim; balasan tidak
  pantas diganti sebelum ditampilkan.

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
