# aemeath-ai-agent

Desktop pet **Aemeath** untuk Windows: hantu digital yang terbang di atas desktopmu, menemani
saat kamu bekerja bersama sesi AI, bisa diajak ngobrol, dan bisa membukakan program lewat
perintah `/nama`. Karya penggemar Wuthering Waves, tidak resmi dan non-komersial (lihat
[Lisensi](#lisensi) dan [Kredit](#kredit)).

## Fitur

### Teman di desktop

- **Terbang bebas.** Aemeath memilih titik acak di layar lalu melayang ke sana, ke atas, ke
  bawah, atau serong, dengan jeda santai di antaranya. Sprite berganti mengikuti arah gerak
  (kiri atau kanan), dan saat diam dia sedikit bergoyang naik-turun seperti melayang.
- **Bisa digeser dan diubah ukurannya.** Seret ke mana saja, Ctrl+scroll atau menu tray untuk
  skala 0,5x sampai 3x. Posisi, skala, dan kecepatan gerak diingat setelah restart.
- **Klik untuk ngobrol, klik kanan untuk menu.** Bagian di bawah merinci keduanya.
- Ikon tray dan jendela memakai ikon persegi; menu tray memuat jumlah sesi AI yang berjalan
  dan yang menunggu keputusanmu.

### Bereaksi pada aktivitasmu

- **Musik.** Mengikuti media session Windows: saat ada lagu diputar, judulnya muncul di
  lencana kecil dan Aemeath melambai.
- **Sesi AI Claude Code.** Membaca transkrip di `~/.claude/projects`, hanya aktivitas baru
  sejak aplikasi dibuka. Sesi berjalan membuatnya memakai animasi kerja; saat selesai muncul
  gelembung ringkasan hasil; saat gagal, animasi `failed` dengan pesan error.
- **Sesi yang menunggu keputusanmu.** Kalau sesi AI mengajukan pertanyaan atau meminta
  persetujuan rencana (`AskUserQuestion`, `ExitPlanMode`), Aemeath berhenti terbang, memasang
  wajah bingung, dan menampilkan pertanyaannya. Izin tool biasa tidak tercatat di transkrip,
  jadi tidak terdeteksi.

### Fleet Snowfluff GPT (ngobrol dengan Aemeath)

- **Celetukan.** Sesekali Aemeath menyapamu sendiri, dalam Bahasa Indonesia dan dengan
  kepribadiannya: ada baris khusus saat sesi AI berjalan, musik diputar, pagi hari, atau lewat
  tengah malam, dan saat ada keputusan yang menunggu. Jedanya diatur dengan slider di
  Pengaturan (rata-rata 1 sampai 15 menit, bawaan 3,5), dan bisa dimatikan.
- **Trivia berkredit.** Sebagian celetukan berupa trivia lore Wuthering Waves dari `lorebook/`
  (42 entri parafrasa, 13 sumber) dengan baris "Sumber: ..." di bawahnya.
- **Kotak chat di samping Aemeath.** Klik Aemeath (atau pilih "Fleet Snowfluff GPT..." di
  tray), ketik, tekan Enter. Esc menutup, tombol ↺ memulai percakapan baru. Tidak ada jendela
  terpisah, dan kotaknya menyesuaikan ruang supaya tidak menutupi Aemeath.
- **Persona.** Chat memakai API DeepSeek (`deepseek-flash` atau `deepseek-v4-pro`). Aemeath
  menjawab sebagai dirinya: ceria, jahil, hangat, memperlakukan Rover seperti sosok wali, dan
  mengutamakan info Wuthering Waves yang akurat. Topik lain boleh dibahas dengan gayanya. Kalau
  tidak yakin, dia bilang terus terang dan tidak mengarang. Lorebook ikut jadi bahan jawaban.
- **Ramah segala usia.** Persona melarang konten dewasa, ditambah penyaring di komputer yang
  mengalihkan pesan tidak pantas sebelum dikirim dan mengganti balasan yang tidak pantas.
- **Pencarian web (opsional).** Untuk pertanyaan informasi, Aemeath mencari dulu di Wuthering
  Waves Wiki (soal game) atau Wikipedia (topik lain), memadukan hasilnya dengan gayanya, dan
  menampilkan sumbernya. Ini pencarian ensiklopedia, bukan mesin pencari umum.
- **Mode offline.** Tanpa API key atau saat internet putus, Aemeath tetap menjawab dari
  lorebook. Kalau dia tidak tahu, dia menyuruhmu mencari di internet atau mengisi API key.
- **Penyedia chat bisa ditambah.** Cukup satu berkas di `src/chat/providers/`.

### Perintah kustom

Ketik `/nama` di kotak chat untuk membuka program, folder, berkas, atau tautan yang kamu atur,
misalnya `/invoice` untuk folder invoice atau `/wuwa` untuk launcher game. Ketik `/` untuk
melihat daftar, Tab melengkapi nama, `/help` menampilkan daftar perintah. Perintah dijalankan
di komputer ini dan tidak dikirim ke chatbot. Program `.exe` bisa diberi argumen.

### Pengaturan dan menu

- **Jendela Pengaturan** (tray → "Pengaturan..."): celetukan dan slider jedanya, chatbot
  (penyedia, model, API key, pencarian web, mode offline), dan perintah kustom (dengan
  pemilih berkas dan folder).
- **Menu tray**: ngobrol, tampilkan atau sembunyikan, skala, kecepatan jalan, deteksi musik,
  pemantau sesi AI, celetukan, pengaturan, atur ulang posisi, keluar.

Semua pengaturan disimpan di folder data aplikasi (`%APPDATA%\Aemeath`), bukan di repo.

## Privasi dan keamanan

**Chatbot**
- API key tidak pernah ada di repo, log, atau jendela selain Pengaturan. Kunci disimpan
  terenkripsi dengan penyimpanan kredensial Windows di folder data aplikasi, dan hanya proses
  utama yang bisa membacanya. Tidak ada fungsi di jendela mana pun yang mengembalikannya.
- Pesan yang kamu ketik di kotak chat dikirim ke penyedia yang dipilih (DeepSeek) untuk
  dijawab, bersama catatan lorebook sebagai bahan jawaban. Isi sesi AI, berkas, dan layarmu
  tidak ikut dikirim.
- Jika pencarian web dinyalakan, kata kunci pertanyaanmu dikirim ke Wuthering Waves Wiki
  (Fandom) atau Wikipedia, dan hasilnya ikut dikirim ke penyedia chatbot sebagai bahan
  jawaban. Pencarian mati secara bawaan.
- Riwayat percakapan hanya ada di memori dan dilupakan 10 menit setelah kotak chat ditutup.
- Pesan yang jelas tidak pantas disaring di komputer dan tidak pernah dikirim.

**Perintah kustom**
- Perintah hanya berjalan dari teks yang kamu ketik sendiri diawali `/`. Balasan chatbot, hasil
  pencarian, dan isi lorebook tidak pernah bisa memicunya.
- Definisinya disimpan di `commands.json` di folder data aplikasi dan hanya jendela Pengaturan
  yang boleh mengubahnya. Kotak chat hanya mengirim nama perintah.
- Tujuan harus jalur lengkap atau tautan `http(s)`. Program dijalankan tanpa shell dengan
  daftar argumen terpisah, jadi karakter seperti `;` atau `&&` tidak ditafsirkan sebagai perintah.

## Menjalankan

Butuh Windows 10/11 dan Node.js 20+.

```powershell
npm install
npm start
```

Chatbot butuh API key DeepSeek yang kamu tempel sendiri di Pengaturan. Tanpa kunci, Aemeath
tetap berjalan dan menjawab dari lorebook.

## Test

```powershell
npm test
```

Alat verifikasi visual: `npx electron . --selfie` menjalankan semua keadaan Aemeath, kotak chat,
Pengaturan, dan perintah kustom dengan balasan, pencarian, dan peluncuran tiruan, lalu menyimpan
tangkapan layar ke `.verify/`. Tambahkan `--user-data-dir=<folder sementara>` supaya tidak
bentrok dengan Aemeath yang sedang berjalan.

## Struktur

| Jalur | Isi |
|---|---|
| `main.js`, `preload.js`, `settings-preload.js` | proses utama Electron: overlay transparan, tray, IPC, jembatan ke renderer |
| `renderer/` | sprite dan gerak (`pet.js`), kotak chat (`chat-panel.js`), jendela Pengaturan |
| `src/walker.js`, `src/atlas.js` | gerak terbang 2D dan pembaca atlas sprite |
| `src/session-parser.js`, `src/claude-code-provider.js` | pembaca transkrip sesi AI dan deteksi keputusan |
| `src/media-watcher.js`, `scripts/` | deteksi musik lewat media session Windows |
| `src/dialogue.js`, `src/lorebook*.js` | celetukan dan pemilih trivia berkredit |
| `src/chat/` | layanan chat, provider DeepSeek, persona, penyaring, pencarian web, jawaban offline, penyimpanan kunci |
| `src/commands/` | penyimpanan, penjalan, dan penangan perintah kustom |
| `src/settings.js` | penyimpanan pengaturan dan migrasi dari nama lama |
| `assets/pet/` | spritesheet dan atlas (sumber dan lisensi di `NOTICE.md`) |
| `lorebook/` | trivia lore berkredit sumber (lihat `lorebook/README.md`) |
| `tests/` | unit test semua modul di atas |

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
  setiap entri menyebut halaman sumbernya. Hasil pencarian web memakai Wuthering Waves Wiki
  dan Wikipedia (CC BY-SA) dengan sumber yang ditampilkan di bawah jawaban.

Rincian atribusi dan teks lisensi ada di [NOTICE.md](NOTICE.md).
