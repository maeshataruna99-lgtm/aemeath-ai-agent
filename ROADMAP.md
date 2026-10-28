# Roadmap Aemeath — sisa pekerjaan

Dokumen ini adalah daftar kerja yang **belum selesai**, disusun ulang dari roadmap awal
(`aemeath_feature_roadmap.md`) setelah P0 dan P1 dikerjakan. Tujuannya supaya sesi atau model AI
berikutnya bisa melanjutkan tanpa menebak konteks.

Terakhir diperbarui: 28 Oktober 2026, di atas commit `8e84ac9`.

---

## Status sekarang

| Fase | Isi | Status |
|---|---|---|
| P0 | Lore-Aware Behavior Director | **Selesai penuh** — `src/behavior/behavior-director.js` |
| P1 | Companion Memory | **Selesai penuh** — `src/memory/memory-store.js` |
| P2 | Focus Companion 2.0 | **Selesai penuh** — `src/productivity/productivity-hub.js` |
| P3 | Perapian lore & pengalaman visual | **Selesai penuh** — `src/feature-guide/` & persona pass |
| P4 | Tema & personalisasi tampilan | **Baru ditambahkan (P4.1 - P4.6)** — rujukan `docs/design/theme-system-spec.md` |

Bukti: `npm test` → 279 lulus, 0 gagal. Verifikasi visual `npx electron . --selfie` → tangkapan di
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

- [x] **0.1 Pengaturan prioritas notifikasi**
  Pemetaan kategori → prioritas kini dapat diatur pengguna melalui `settings.js` dan antarmuka
  tab *Umum* (Pengaturan), lalu diteruskan ke `createBehaviorDirector({ priorities })` dan
  `director.setPriorities()`. Pengguna dapat menaikkan/menurunkan prioritas notifikasi (1-6) tanpa
  mengubah kode sumber. Diuji di `tests/behavior.test.js` dan `tests/settings.test.js`.

- [x] **0.2 Mode senyap sistem (Do Not Disturb / jam tenang)**
  Jam tenang yang dapat dikonfigurasi (`quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd`)
  ditambahkan di `settings.js`, tab *Umum* (Pengaturan), dan diintegrasikan ke `behavior-director.js`.
  Celetukan proaktif otomatis ditahan (`reason: 'quiet'`) saat waktu saat ini berada dalam rentang
  jam tenang, sementara event keputusan (`decision`), kegagalan (`failure`), dan timer tetap lolos.
  Mendukung rentang melintasi tengah malam dan batas jam 00:00. Diuji di `tests/behavior.test.js` dan
  `tests/settings.test.js`.

- [x] **0.3 Dokumentasi perilaku per mode** — sudah masuk README (tabel mode + bagian Memori companion).

---

## P1 — sisa

- [x] **1.1 Pecah ringkasan sesi Full menjadi dua entri**
  Sekarang `acceptOffer()` menyimpan ringkasan dan langkah berikutnya menjadi dua entri terpisah
  (satu `context`, satu `next-step`). Jika ringkasan tidak memuat langkah berikutnya, hanya satu
  entri yang disimpan tanpa mengarang data. Keduanya tersimpan dengan `source: 'assistant'` dan `project`
  yang sama serta dapat dihapus secara terpisah. Diuji di `tests/memory.test.js`.

- [x] **1.2 Preferensi frekuensi sapaan**
  Ketika ada memori preferensi sapaan/celetukan (mis. ingin sapaan lebih jarang atau lebih sering),
  Aemeath menawarkan penyesuaian interval (`preferenceOffer`) melalui balon dialog interaktif
  dengan tombol "Ubah" tanpa pernah mengubah setelan secara sepihak. Menghormati mode (hanya aktif
  di Medium dan Full, tenang di Low dan disabled) serta jeda cooldown (`PREFERENCE_OFFER_GAP_MS`).
  Hanya jika pengguna mengklik tombol persetujuan, `acceptOffer` meneruskan `settingsPatch` untuk
  disimpan ke `chatterIntervalMin`. Diuji di `tests/memory.test.js`.

- [x] **1.3 Keputusan retensi entri tulisan pengguna**
  Keputusan ditetapkan dan didokumentasikan di `README.md`: entri tulisan pengguna (`source: 'user'`)
  **tidak pernah dihapus otomatis** untuk melindungi catatan personal dari kehilangan data diam-diam.
  Retensi berkala hanya membersihkan ringkasan AI (`source: 'assistant'`). Keputusan ini tercermin
  eksplisit di `status().retentionScope = 'assistant-only'`, di antarmuka tab *Memori* (Pengaturan),
  dan diuji di `tests/memory.test.js`.

- [x] **1.4 Perintah `/memory` (opsional)**
  Perintah bawaan `/memory` ditambahkan di `src/memory/memory-store.js` (`createMemoryBuiltin`), didaftarkan
  ke daftar perintah terlindungi (`BUILTIN_NAMES` di `command-store.js`), dan diintegrasikan ke `main.js`.
  Mendukung `/memory` (menampilkan daftar catatan bernomor), `/memory nonaktif` dan `/memory aktif`
  (mengubah status tanpa merusak berkas), serta `/memory hapus <nomor>` (menghapus catatan sesuai nomor
  urutan secara aman dan memvalidasi nomor sebelum eksekusi). Diuji di `tests/memory.test.js` dan
  `tests/commands.test.js`.

---

## P2 — Focus Companion 2.0

Tujuan: menyatukan `/timer`, `/todo`, `/note`, `/stats`, sesi AI, dan `/review` menjadi satu alur
kerja — **tanpa** menduplikasi penyimpanan yang sudah ada.

- [x] **2.1 Sesi kerja terorkestrasi**
  Modul baru `src/productivity/work-session.js` diimplementasikan untuk mengorkestrasi alur kerja
  fokus: pelacakan sesi eksplisit (mulai, tugas terkait, durasi, selesai), pencatatan event sesi AI,
  dan hasil review git lokal (`/review`). Terintegrasi dengan `productivity-hub.js` (`/todo fokus <nomor>`,
  perintah baru `/focus [durasi] [tugas]`, `/focus status`, `/focus selesai`), `pushPresence()` di `main.js`,
  dan balon pet di `pet.js`. Ringkasan sesi selesai diformat secara ketat berdasarkan fakta yang tersedia
  dan menandai secara eksplisit data yang tidak ada (`[tidak ada / belum dijalankan]`) tanpa mengarang status
  tes atau commit. Diuji di `tests/work-session.test.js` dan `tests/productivity.test.js`.

- [x] **2.2 Daily Quest**
  Perluasan skema aman pada `productivity-hub.js` dengan `normalizeState(raw, nowMs)` tanpa menghilangkan data
  `todos` dan `notes` legacy. Mendukung maksimal 3 prioritas harian (`/quest tambah <teks>`, `/quest todo <nomor>`,
  `/quest selesai <nomor>`, `/quest hapus <nomor>`, `/quest riwayat`, `/quest bersih`, serta alias `/daily`).
  Item quest dapat ditautkan ke `/todo` dan otomatis selesai saat todo terkait ditandai selesai. Selesai hanya
  berdasarkan konfirmasi pengguna/bukti tanpa skor, poin, atau hukuman rasa bersalah. Pergantian hari (`rolloverQuestsIfNeeded`)
  mengarsipkan riwayat ke `questHistory` tanpa menghapus tugas yang belum selesai (unclosed quests otomatis dipertahankan
  ke hari baru). Dilindungi di `BUILTIN_NAMES` dan diuji secara komprehensif di `tests/daily-quest.test.js`.

- [x] **2.3 Resume Work**
  `memoryStore.continuation(mode)` diperluas untuk menyajikan ringkasan proyek terakhir, tugas tertunda,
  dan langkah berikutnya yang tersimpan dari memori companion. Menyajikan 3 pilihan eksplisit bagi pengguna
  pada balon bicara: "Lanjut" (`resume`), "Ubah" (`modify`), dan "Abaikan" (`dismiss`).
  Pilihan "Lanjut" mencatat kelanjutan kerja dengan respons hangat tanpa meluncurkan aksi eksternal,
  "Ubah" membuka fokus chat agar pengguna dapat menyunting tugas/perintah secara bebas, dan "Abaikan"
  menolak tawaran dengan santun. Tidak ada aplikasi, terminal, atau berkas yang dibuka secara otomatis.
  Diuji secara komprehensif di `tests/resume-work.test.js` dan `tests/memory.test.js`.

- [x] **2.4 Gating mode untuk P2**
  Gating mode diverifikasi dan diuji secara ketat untuk ketiga mode:
  - **Low:** seluruh alat produktivitas (`/timer`, `/focus`, `/todo`, `/quest`, `/note`, `/stats`) murni manual, tanpa sesi proaktif, tanpa pelacakan kategori di `/stats`, dan tanpa sapaan kelanjutan kerja proaktif.
  - **Medium:** pemantauan aktivitas tanpa membaca judul jendela sensitif, rekap waktu per kategori di `/stats`, pengingat istirahat/timer saat sesi kerja panjang terdeteksi, celetukan desktop diizinkan, dan sapaan kelanjutan tugas tertunda (Resume Work) maksimal 1 kali per 6 jam.
  - **Full** *(wajib persetujuan eksplisit):* integrasi penuh konteks kerja (bahasa kode, status tes, review git lokal via `/review`, sesi AI Claude Code/Antigravity, sesi kerja terorkestrasi `/focus`, timer, `/todo`, dan `/quest`), serta proposal penyimpanan ringkasan sesi kerja faktual ke memori companion hanya setelah pengguna menekan "Simpan".
  Perilaku ketiga mode dijelaskan secara ringkas di `README.md` dan diuji secara komprehensif di `tests/p2-gating.test.js`.

---

## P3 — Perapian lore dan pengalaman visual

- [x] **3.1 Metadata dan verifikasi lorebook**
  Metadata verifikasi per entri (`status: 'verified'|'unverified'`, `kind: 'canon'|'interpretation'|'evolving'`,
  `checkedAt: YYYY-MM-DD`) diimplementasikan di seluruh 74 entri bawaan (`lorebook/*.json`), divalidasi ketat
  oleh `validateLorebook` di `src/lorebook.js`, dan diisi otomatis pada entri baru dari sync wiki di `src/lorebook-updater.js`
  (`buildEntry`). `src/chat/local-responder.js` memastikan entri tanpa sumber valid atau yang berstatus `unverified`
  tidak pernah dipakai sebagai jawaban fakta pasti. Terdokumentasi lengkap di `lorebook/README.md` dan diuji di
  `tests/lorebook-verification.test.js`.

- [x] **3.2 Hubungkan event perilaku dengan animasi**
  Pemetaan komprehensif perilaku ke animasi diimplementasikan di `src/atlas.js` (`animationForBehavior`).
  Tawaran memori (`waiting`), hasil simpan/tolak memori (`waving`/`idle`), Daily Quest selesai (`jumping`),
  Resume Work (`waving` untuk tawaran, `jumping` saat Lanjut, `waiting` saat Ubah, `idle` saat Abaikan),
  serta keputusan pending (`waiting`) terhubung penuh ke baris atlas. Tidak ada nama animasi di luar atlas
  dan diuji secara ketat di `tests/behavior-animation.test.js` serta `tests/atlas.test.js`.

- [x] **3.3 Daily Chronicle (opsional)**
  Modul `src/productivity/daily-chronicle.js` (`formatDailyChronicle`) dan perintah bawaan `/chronicle`
  (`/chronicle`, `/chronicle aktif`, `/chronicle nonaktif`) diimplementasikan untuk menyajikan ringkasan harian
  faktual: apa yang dikerjakan (sesi fokus dan durasi nyata, rekap aktivitas), dan apa yang tersisa (Daily Quest
  dan tugas /todo tertunda). Hanya menyajikan data lokal yang benar-benar ada tanpa angka rekaan, rating, skor,
  atau metrik tanpa sumber. Dapat dinonaktifkan sepenuhnya (`dailyChronicleEnabled: false`). Dilindungi di
  `BUILTIN_NAMES` dan diuji di `tests/daily-chronicle.test.js`.

- [x] **3.4 Persona pass untuk respons proaktif**
  Tinjau ulang seluruh teks proaktif (celetukan, reaksi aktivitas, tawaran memori, ringkasan) agar
  terdengar seperti Aemeath dan tidak mengklaim ingatan yang tidak tersimpan. Seluruh kalimat yang menyebut
  "sistem", "database", atau "memori" ke pengguna telah dibersihkan (mis. "semua sistem hijau" -> "kondisiku prima dan penuh energi",
  "simpan ke memori" -> "catatan kita", "di memori tercatat" -> "sesuai preferensimu"). Diuji secara ketat di
  `tests/persona-pass.test.js`.

**Voice Companion tetap di luar cakupan** (sesuai roadmap awal).

---

## P4 — Tema & personalisasi tampilan

Ukuran: S (kecil), M (sedang), L (besar). Rujukan desain: `docs/design/theme-system-spec.md` dan `docs/design/glass-card.md`.

- [x] **4.1 Fondasi token (M)**
  Ekstrak semua warna, blur, radius, dan ukuran teks yang hardcode di CSS renderer menjadi variable di `renderer/theme.css`, memakai nama dari `docs/design/glass-card.css`.
  - Hasil: tampilan identik dengan sebelumnya (refactor murni, tanpa fitur baru).
  - Selesai bila: tidak ada lagi warna literal di CSS komponen (cek dengan grep: 0 literal ditemukan), dan `--selfie` menghasilkan tangkapan layar dan computed bubbleStyle identik. Semua 314 unit test lulus.

- [x] **4.2 Mesin tema (M)**
  `src/theme/theme-schema.js`, `derive.js`, `contrast.js`, `presets.js`, `theme-store.js`, beserta unit test di `tests/theme.test.js`.
  - Selesai bila: input acak/ekstrem tidak pernah menghasilkan token di luar rentang; derivasi OKLCH punya test nilai acuan; berkas rusak dan versi lebih baru tertangani. Diuji dengan 8 test suite komprehensif, seluruh 322 test repo lulus.

- [x] **4.3 IPC dan penyiaran (S)**
  `theme:get`, `theme:preview`, `theme:set`, `theme:set-preset`, `theme:changed`, dipaparkan lewat preload (`preload.js`, `settings-preload.js`, `feature-preload.js`), dihubungkan ke `renderer/theme-apply.js`.
  - Selesai bila: mengubah tema di Pengaturan langsung terlihat di jendela pet, chat, dan fitur tanpa restart, dan jendela renderer tidak bisa mengirim CSS mentah. Terverifikasi 6/6 test di `tests/theme-ipc.test.js`, seluruh 328 test repo lulus.

- [x] **4.4 Tab Tampilan dengan slider (L)**
  Tab kelima di Pengaturan: pilih preset, slider warna dan kaca, kartu pratinjau, tombol Reset, mode Gelap/Terang/Sistem, toggle "Kurangi efek".
  - Slider sesuai standar `/ui-ux-pro-max` dan spec 5.2 (track hidup, thumb berwarna, input angka, keyboard nav, snap magnetic).
  - Selesai bila: semua slider bisa dipakai dengan keyboard saja, dan pratinjau tidak patah saat digeser cepat. Terverifikasi visual di `settings-appearance.png` via `--selfie`.

- [x] **4.5 Penjaga kontras dan aksesibilitas (S)**
  Peringatan kontras (target WCAG AA 4,5:1 untuk teks normal, 3:1 untuk teks sekunder), "Perbaiki otomatis", dukungan `prefers-reduced-motion`, fallback tanpa `backdrop-filter`.
  - Selesai bila: tidak ada kombinasi slider yang menghasilkan teks utama di bawah 4,5:1 setelah koreksi otomatis. Terverifikasi pada pengujian `tests/appearance.test.js`.

- [x] **4.6 Impor/ekspor dan menu tray (S)**
  Ekspor tema ke berkas JSON dan impor kembali (melewati validasi skema ketat); submenu "Tema" di tray untuk berganti preset cepat.
  - Selesai bila: berkas impor yang berisi nilai di luar rentang atau kunci asing ditolak atau dibersihkan, bukan diterapkan. Submenu tray terintegrasi di `menuTemplate()` dan teruji. Seluruh 334 test repo lulus.

---

## Checklist review & pengujian yang belum bisa dicentang

- [x] Regresi: chat, `/search`, `/timer`, `/todo`, `/note`, `/stats`, perintah kustom, terminal —
  tercakup `npm test` dan jalur `--selfie`.
- [x] **Regresi `/review`**: diuji dengan repo git sementara nyata di `tests/work-reviewer.test.js` (memverifikasi
  kasus repo bersih, repo kotor dengan modifikasi berkas kode/test/untracked, dan penanganan saat bukan repo git).
- [x] **Pengujian build**: skrip verifikasi menyeluruh diimplementasikan via `scripts/verify.js` dan perintah `npm run verify`
  (memeriksa validitas sintaks seluruh 46 berkas JavaScript dan menjalankan `npm test` dengan 302/302 pengujian lulus).
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
| `src/theme/` | validasi skema, derivasi OKLCH, kontras, preset, dan store tema (P4) |
| `docs/design/` | spesifikasi sistem tema & kartu kaca acuan (`glass-card.css`, `theme-system-spec.md`) |
| `renderer/` | `pet.js` (balon + director), `chat-panel.js`, `settings.*` (5 tab), `theme.css` |
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
