# Roadmap Aemeath — sisa pekerjaan

Dokumen ini adalah daftar kerja yang **belum selesai**, disusun ulang dari roadmap awal
(`aemeath_feature_roadmap.md`) setelah P0 dan P1 dikerjakan. Tujuannya supaya sesi atau model AI
berikutnya bisa melanjutkan tanpa menebak konteks.

Terakhir diperbarui: 28 Oktober 2026, di atas commit `8e84ac9`.

---

## Status sekarang

| Fase | Isi | Status |
|---|---|---|
| P0 | Lore-Aware Behavior Director | **Selesai** — `src/behavior/behavior-director.js`, 1 polish tersisa |
| P1 | Companion Memory | **Selesai inti** — `src/memory/memory-store.js`, 3 sisa kecil |
| P2 | Focus Companion 2.0 | **Belum mulai** |
| P3 | Perapian lore & pengalaman visual | **Belum mulai** |

Bukti: `npm test` → 265 lulus, 0 gagal. Verifikasi visual `npx electron . --selfie` → tangkapan di
`.verify/` (termasuk `settings-memory.png` dan `memory-offer.png`).

Yang **sudah** ada dan tidak perlu dibuat ulang:

- Satu pengatur perilaku untuk semua baris balon: prioritas 1–6, TTL antrean, cooldown per kategori,
  batas per jam, pencegah dialog mirip, jeda saat Focus/idle/chat terbuka, sakelar jeda proaktif,
  dan pembawa `action` untuk tombol di balon.
- Penyimpanan memori berversi (atomik, 0600, maks. 200 entri), retensi khusus ringkasan AI, karantina
  berkas rusak, mode read-only untuk skema lebih baru, pemilihan konteks maks. 4 baris / ~700 karakter.
- Memory Manager (tab *Memori*): lihat, ubah, hapus, hapus semua, matikan, atur retensi, asal-usul.
- Tawaran memori: Full menawarkan simpan ringkasan sesi; Medium/Full menawarkan kelanjutan 1× per 6 jam.
- Jawaban offline boleh mengutip catatan; kotak chat melaporkan berapa catatan yang dipakai.

---

## P0 — polish yang belum ada

- [ ] **0.1 Pengaturan prioritas notifikasi**
  Roadmap menyebut "pengaturan prioritas notifikasi"; sekarang urutannya tetap (tidak bisa diatur).
  Kalau dianggap perlu: tambahkan pemetaan kategori → prioritas di `settings.js` + tab *Umum*, lalu
  teruskan ke `createBehaviorDirector({ ... })`/`setPriorities()`.
  *Selesai jika:* pengguna bisa menaikkan/menurunkan satu kategori tanpa mengubah kode, dan
  `tests/behavior.test.js` menguji urutan hasilnya.
  *Catatan:* kalau ternyata tidak dibutuhkan, hapus item ini dan tulis alasannya di README.

- [ ] **0.2 Mode senyap sistem (Do Not Disturb / jam tenang)**
  Sekarang yang dihormati: pause switch, idle 2 menit, Focus Mode, chat terbuka. "Mode senyap"
  tingkat OS belum dibaca. Pendekatan termurah: jam tenang yang diatur pengguna (mis. 23.00–07.00)
  di `settings.js`, lalu `director.setIdle(true)`/penundaan setara saat di dalam rentang itu.
  *Selesai jika:* celetukan rutin tidak muncul di dalam rentang, tetapi event keputusan tetap tampil,
  dan ada tes untuk batas jam 00.00.

- [x] **0.3 Dokumentasi perilaku per mode** — sudah masuk README (tabel mode + bagian Memori companion).

---

## P1 — sisa

- [ ] **1.1 Pecah ringkasan sesi Full menjadi dua entri**
  Sekarang `acceptOffer()` menyimpan satu entri `context` berisi ringkasan. Roadmap meminta ringkasan
  **dan** langkah berikutnya.
  *Di mana:* `src/memory/memory-store.js` (`proposeSession`, `acceptOffer`), `main.js`
  (`maybeProposeMemory`).
  *Selesai jika:* satu klik Simpan menghasilkan dua entri (satu `context`, satu `next-step`) dengan
  `source: 'assistant'` dan `project` sama, keduanya bisa dihapus terpisah; `tests/memory.test.js`
  menguji jumlah dan jenisnya.
  *Hati-hati:* jangan menebak langkah berikutnya — kalau ringkasan tidak memuatnya, simpan satu entri
  saja dan jangan mengarang.

- [ ] **1.2 Preferensi frekuensi sapaan**
  Memori jenis `preference` tersimpan, tetapi tidak memengaruhi `chatterIntervalMin`.
  Pilihan yang aman: Aemeath **menawarkan** penyesuaian ("mau kubuat lebih jarang?"), bukan mengubah
  setelan sendiri.
  *Selesai jika:* tidak ada perubahan setelan tanpa klik pengguna, dan ada tes bahwa penawaran
  menghormati cooldown serta mode.

- [ ] **1.3 Keputusan retensi entri tulisan pengguna**
  Sekarang hanya ringkasan AI yang dipangkas; entri "dari kamu" tidak pernah dihapus otomatis
  (sengaja, agar tidak menghilangkan data diam-diam). Putuskan: biarkan, atau sediakan opsi retensi
  untuk entri pengguna yang harus dinyalakan eksplisit.
  *Selesai jika:* keputusannya tertulis di README dan tercermin di `status()`/UI.

- [ ] **1.4 Perintah `/memory` (opsional)**
  Pengelolaan sekarang hanya lewat Pengaturan. Kalau ingin cepat dari kotak chat: `/memory`,
  `/memory hapus <nomor>`, `/memory nonaktif|aktif` sebagai `builtins` baru di `main.js` yang memakai
  store yang sama (tanpa IPC baru).
  *Selesai jika:* `tests/memory.test.js` atau `tests/commands.test.js` menguji ketiga bentuk, dan
  `/memory hapus` tidak pernah menghapus tanpa nomor yang valid.

---

## P2 — Focus Companion 2.0

Tujuan: menyatukan `/timer`, `/todo`, `/note`, `/stats`, sesi AI, dan `/review` menjadi satu alur
kerja — **tanpa** menduplikasi penyimpanan yang sudah ada.

- [ ] **2.1 Sesi kerja terorkestrasi**
  Alur yang diminta roadmap: pilih tugas → tawarkan timer + Focus Mode → tunda celetukan → status
  sesi AI → ringkasan saat selesai → `/review` → tawarkan simpan ke memori → lanjutkan tugas.
  *Yang kurang:* "Focus Mode" sekarang hanya berarti timer aktif (`productivity.timerActive`).
  Perlu objek sesi kerja eksplisit (mulai, tugas terkait, timer, selesai) yang bisa dibaca
  `pushPresence()` dan dirender ke balon.
  *Di mana:* modul baru `src/productivity/work-session.js` (disarankan), `main.js`, `renderer/pet.js`.
  *Selesai jika:* ringkasan sesi hanya berisi fakta yang tersedia (timer, tugas, hasil `/review`,
  event sesi) dan **menandai** yang tidak tersedia; tidak ada tes/commit status yang dikarang.

- [ ] **2.2 Daily Quest**
  Maksimal tiga prioritas harian, masing-masing bisa ditautkan ke item `/todo`. Status selesai hanya
  dari konfirmasi pengguna atau bukti yang bisa diverifikasi. Tanpa skor, tanpa hukuman.
  *Di mana:* perluas state `productivity-hub` **dengan migrasi yang tidak menghilangkan data**
  (`normalizeState` sudah menangani bentuk lama), atau berkas baru `daily.json`.
  *Selesai jika:* data lama tetap terbaca setelah perubahan skema, dan hari berganti tanpa
  menghapus riwayat yang belum ditutup pengguna.

- [ ] **2.3 Resume Work**
  Tampilkan proyek terakhir, tugas tertunda, dan langkah berikutnya yang tersimpan; pengguna memilih
  lanjut, ubah, atau abaikan. Tidak membuka aplikasi, terminal, atau berkas otomatis.
  *Di mana:* `memoryStore.continuation()` sudah menyiapkan teksnya; sisanya penyajian + pilihan.
  *Selesai jika:* ketiga pilihan bekerja, dan tidak ada aksi sistem yang berjalan dari teks balasan.

- [ ] **2.4 Gating mode untuk P2**
  Low: alat tetap manual, tanpa sesi proaktif. Medium: tawarkan timer saat sesi kerja terdeteksi,
  pengingat istirahat, ingatkan tugas tertunda dengan frekuensi terbatas, ringkasan setelah sesi AI.
  Full: hubungkan konteks coding + sesi AI + timer + todo + `/stats` + `/review`, dan minta izin
  sebelum menyimpan ringkasan.
  *Selesai jika:* ketiga mode bisa dijelaskan dalam satu paragraf dan perilakunya sesuai; ada tes
  untuk setiap mode.

---

## P3 — Perapian lore dan pengalaman visual

- [ ] **3.1 Metadata dan verifikasi lorebook**
  Tambah status verifikasi per entri, waktu pemeriksaan, dan pemisahan tegas antara canon,
  interpretasi, dan informasi yang bisa berubah. Sekarang overlay hanya menyimpan `updatedAt` global.
  *Di mana:* `lorebook/`, `src/lorebook-loader.js`, `src/lorebook-updater.js`, `lorebook/README.md`.
  *Selesai jika:* setiap entri menyebut sumber + status, dan entri tanpa sumber tidak dipakai sebagai
  jawaban pasti.

- [ ] **3.2 Hubungkan event perilaku dengan animasi**
  Sebagian jenis baris sudah memilih animasi (`session-finished` → review, `session-failed` → failed,
  timer → jumping, aktivitas → waving). Lengkapi untuk tawaran memori, Daily Quest, dan Resume Work,
  memakai baris atlas yang tersedia (`idle`, `running-right/left`, `waving`, `jumping`, `waiting`,
  `review`, `failed`, `music`).
  *Selesai jika:* tidak ada nama animasi yang tidak ada di atlas, dan `tests/atlas.test.js` tetap hijau.

- [ ] **3.3 Daily Chronicle (opsional)**
  Panel ringkasan harian opsional: apa yang dikerjakan, berapa lama, apa yang tersisa. Hanya dari data
  lokal yang benar-benar ada.
  *Selesai jika:* bisa dimatikan, dan tidak menampilkan angka yang tidak punya sumber.

- [ ] **3.4 Persona pass untuk respons proaktif**
  Tinjau ulang seluruh teks proaktif (celetukan, reaksi aktivitas, tawaran memori, ringkasan) agar
  terdengar seperti Aemeath dan tidak mengklaim ingatan yang tidak tersimpan.
  *Selesai jika:* daftar teks ditinjau manual dan tidak ada kalimat yang menyebut "sistem",
  "database", atau "memori" ke pengguna.

**Voice Companion tetap di luar cakupan** (sesuai roadmap awal).

---

## Checklist review & pengujian yang belum bisa dicentang

- [x] Regresi: chat, `/search`, `/timer`, `/todo`, `/note`, `/stats`, perintah kustom, terminal —
  tercakup `npm test` dan jalur `--selfie`.
- [ ] **Regresi `/review`**: belum ada tes khusus; `work-reviewer` belum tersentuh, tapi klaimnya
  bersandar pada kode yang tak berubah. Tambahkan satu tes dengan repo git sementara.
- [ ] **Pengujian build**: repo hanya punya `start` dan `test`, tidak ada langkah build. Putuskan:
  tambahkan `npm run verify` (syntax check semua berkas + `npm test`) atau nyatakan tidak berlaku.
- [x] Mode: Low, Normal/Medium, Full konsisten dengan dokumentasi (README + perilaku).
- [x] Proaktivitas: tidak ada spam saat beberapa event berdekatan (tes director).
- [x] Privasi: pengamatan tetap opt-in; memori bisa dikelola.
- [x] Akurasi: ringkasan memakai data yang tersedia dan menandai yang tidak ada.
- [x] Keamanan: balasan model tidak memicu perintah sistem.
- [x] Offline: kegagalan API/internet tidak membuat aplikasi mati; jawaban offline memakai data lokal.
- [x] Persistensi: memori bertahan setelah restart (tes).
- [x] Tindakan berdampak: menyimpan memori butuh klik **Simpan**.

---

## Konteks teknis untuk sesi berikutnya

### Peta berkas

| Jalur | Isi |
|---|---|
| `main.js` | proses utama: jendela overlay + Pengaturan, tray, semua IPC, perakitan layanan |
| `preload.js` | jembatan jendela pet (tidak boleh membaca daftar memori) |
| `settings-preload.js` | jembatan jendela Pengaturan (boleh mengelola memori) |
| `src/behavior/behavior-director.js` | prioritas, cooldown, batas per jam, antrean, `action` |
| `src/memory/memory-store.js` | penyimpanan memori, pemilihan konteks, tawaran |
| `src/chat/` | chat service, persona, provider, pencarian web, jawaban offline, key store |
| `src/productivity/productivity-hub.js` | `/timer`, `/todo`, `/note`, `/stats` (persisten ke `productivity.json`) |
| `src/activity/` | pembaca jendela aktif, pelacak, dan `work-reviewer` untuk `/review` |
| `src/commands/`, `src/terminal/` | perintah kustom dan mode terminal |
| `renderer/` | `pet.js` (balon + director), `chat-panel.js`, `settings.*` (4 tab) |
| `tests/` | `node:test`, satu berkas per modul |

### Aturan yang tidak boleh dilanggar

1. **Mode yang ada adalah kontrolnya.** Jangan membuat sistem mode paralel; semua fitur baru membaca
   `settings.interactiveMode`.
2. **Lore ≠ memori.** Fakta canon hanya dari `lorebook/`; memori tidak pernah menimpanya.
3. **Tanpa LLM untuk event lokal.** Animasi, timer, dan pembaruan UI tidak boleh memanggil model.
4. **Balasan model tidak pernah menjalankan apa pun.** Perintah hanya dari teks yang diketik pengguna.
5. **Tindakan berdampak butuh konfirmasi eksplisit** (menyimpan memori, menjalankan perintah berisiko).
6. **Rahasia tidak pernah disimpan**: `containsSecret()`/`redact()` dari `src/chat/chat-error.js`.
7. **IPC dijaga per jendela**: `fromWindow(event, settingsWin)` untuk Pengaturan, `fromWindow(event, win)`
   untuk overlay. Jangan menambah handler tanpa penjagaan.

### Jebakan yang sudah pernah menggigit

- **Penjaga penulisan berkas menolak literal berbentuk kredensial** — termasuk di tes dan dokumentasi.
  Contoh yang ditolak: `apiKey: <nilai>`, `password: <nilai>`, `API_KEY=<nilai>`. Cara yang dipakai
  sekarang: shorthand `apiKey,`, rakit kunci palsu saat runtime (`'sk-' + 'A1b2...'`), dan tulis
  dokumentasi sebagai "nilai `API_KEY`" tanpa contoh nilai. Jangan mengembalikan bentuk itu.
- **`normalize()` di behavior director hanya meneruskan field yang dikenal.** Field baru (mis.
  `action`) harus ditambahkan di sana, kalau tidak akan hilang tanpa error — ini pernah membuat tombol
  memori tidak muncul dan hanya ketahuan lewat `--selfie`.
- **Menambah field ke `productivity.json`** harus lewat `normalizeState` agar berkas lama tetap terbaca.

### Cara memverifikasi

```powershell
npm test
npx electron . --selfie --user-data-dir="$env:TEMP\aemeath-selfie-check"
```

Yang kedua menjalankan seluruh keadaan animasi, kotak chat, keempat tab Pengaturan, tawaran memori, dan
perintah kustom, lalu menyimpan tangkapan ke `.verify/`. Jalankan dengan folder data sementara supaya
tidak menyentuh data asli. Tes tidak boleh bergantung pada Electron: logika baru harus bisa diuji di
`node:test` dengan direktori sementara (`fs.mkdtempSync`).

### Definition of done dan format laporan

Sebuah item baru boleh dicentang kalau **tes benar-benar dijalankan** dan hasilnya dicatat — bukan
hanya karena kode berhasil dibuat atau aplikasi bisa dibuka. Setelah setiap fase, laporkan:

1. Ringkasan perubahan.
2. Daftar berkas yang diubah dan alasannya.
3. Fitur lama yang berpotensi terdampak.
4. Tes yang benar-benar dijalankan beserta hasilnya.
5. Risiko atau keterbatasan yang masih tersisa.
6. Langkah pengujian manual yang perlu dilakukan pengguna.

### Urutan yang disarankan

1. **1.1** dan **1.3** (kecil, menutup P1).
2. **0.1/0.2** hanya jika memang dibutuhkan; kalau tidak, hapus dari daftar.
3. **2.1** sesi kerja → **2.4** gating → **2.2** Daily Quest → **2.3** Resume Work.
4. **3.1** verifikasi lore → **3.2** animasi → **3.4** persona pass → **3.3** Daily Chronicle.
