# aemeath-ai-agent

Desktop pet **Aemeath** untuk **Windows** dan **Linux Mint / Linux**: hantu digital yang terbang di atas desktopmu, menemani
saat kamu bekerja bersama sesi AI, bisa diajak ngobrol, dan bisa membukakan program lewat
perintah `/nama`. Aemeath otomatis mendeteksi sistem operasi yang dipakai (Windows maupun Linux Mint / Cinnamon) dan menyesuaikan pengaturan, contoh perintah kustom, shell terminal (`PowerShell` vs `Bash`), pemantau jendela aktif (`xdotool`/`xprop`), musik (`playerctl` MPRIS), serta autostart (`~/.config/autostart/aemeath.desktop`). Karya penggemar Wuthering Waves, tidak resmi dan non-komersial (lihat
[Lisensi](#lisensi) dan [Kredit](#kredit)).

## Fitur

### Teman di desktop

- **Terbang bebas.** Aemeath memilih titik acak di layar lalu melayang ke sana, ke atas, ke
  bawah, atau serong, dengan jeda santai di antaranya. Sprite berganti mengikuti arah gerak
  (kiri atau kanan), dan saat diam dia sedikit bergoyang naik-turun seperti melayang.
- **Bisa digeser dan diubah ukurannya.** Seret ke mana saja, Ctrl+scroll atau menu tray untuk
  skala 0,5x sampai 3x. Posisi, skala, dan kecepatan gerak diingat setelah restart.
- **Bisa diam di tempat.** Kalau Aemeath tidak perlu berkeliling, nyalakan "Aemeath diam di tempat" di Pengaturan
  (tab *Umum*) atau menu tray. Dia tetap bisa diseret, berbicara, dan bereaksi.
- **Mode transparan (tembus klik) & slider opacity.** Nyalakan "Mode transparan" di Pengaturan (tab *Umum*)
  atau menu tray untuk mengaktifkan slider opacity sprite (15% sampai 100%, bawaan 60%) sekaligus membuat
  mouse menembus sprite dan gelembung bicara Aemeath tanpa menghalangi klik pada aplikasi di bawahnya.
- **Klik untuk ngobrol, klik kanan untuk menu, atau tekan pintasan keyboard.** Pintasan bawaan
  `Alt+Space` (bisa diganti atau dimatikan di Pengaturan, tab *Umum*) membuka atau menutup kotak
  chat dari aplikasi mana saja.
- **Jalan otomatis saat Windows menyala.** Aktif secara bawaan, jadi Aemeath muncul sendiri setiap kali kamu
  menyalakan komputer. Bisa dimatikan di Pengaturan, tab *Umum*, yang juga menampilkan apakah Windows
  benar-benar akan menjalankannya (misalnya bila dinonaktifkan di Pengelola Tugas).
- Ikon tray dan jendela memakai ikon persegi; menu tray memuat jumlah sesi AI yang berjalan
  dan yang menunggu keputusanmu.

### Bereaksi pada aktivitasmu

- **Musik.** Mengikuti media session Windows: saat ada lagu diputar, judulnya muncul di
  lencana kecil dan Aemeath melambai.
- **Sesi AI (Claude Code & Antigravity).** Membaca transkrip di `~/.claude/projects` dan
  `~/.gemini/antigravity/brain`, hanya aktivitas baru sejak aplikasi dibuka. Sesi berjalan
  membuatnya memakai animasi kerja; saat selesai muncul gelembung ringkasan hasil; saat gagal,
  animasi `failed` dengan pesan error. Mengklik gelembung sesi membuka folder proyek terkait.
- **Sesi yang menunggu keputusanmu.** Kalau sesi AI mengajukan pertanyaan atau meminta
  persetujuan rencana (`AskUserQuestion`, `ExitPlanMode`, `ask_question`), Aemeath berhenti terbang,
  memasang wajah bingung, dan menampilkan pertanyaannya. Izin tool biasa tidak tercatat di transkrip,
  jadi tidak terdeteksi.

### Mode interaktif

Seberapa jauh Aemeath ikut campur diatur di Pengaturan, tab *Umum*:

| Mode | Yang dilakukan Aemeath |
|---|---|
| **Low** (bawaan) | Mengajakmu mengobrol dan berbicara seperti biasa: celetukan, trivia, dan chat. |
| **Medium** | Selain Low, dia boleh melihat aplikasi yang sedang kamu pakai (browsing, main game, ngoding, dan lain-lain) dan memperingatkanmu kalau kelamaan doomscrolling. |
| **Full** | Semua dari Medium (mendeteksi program yang dibuka & media sosial), ditambah komentar aktif saat ngoding (bahasa & tes), deteksi pindah-pindah aplikasi terlalu cepat, serta `/review` untuk menilai perubahan git lokal (tanpa tangkapan layar). |

Medium dan Full baru menyala setelah kamu menyetujui penjelasan di Pengaturan. Yang dilakukan Medium:

- **Membaca** nama aplikasi dan judul jendela yang sedang aktif, setiap beberapa detik, lalu
  mengelompokkannya: media sosial, video, game, ngoding, kerja, obrolan, musik, browser, atau lainnya.
- **Doomscrolling.** Setelah media sosial (Instagram, TikTok, Facebook, X, Reddit, YouTube Shorts,
  dan sejenisnya) terbuka terus selama batas yang kamu atur (5 sampai 120 menit, bawaan 20),
  Aemeath memperingatkanmu, makin tegas di kelipatan batas itu. Istirahat 5 menit mengakhiri hitungannya,
  dan waktu saat kamu tidak menyentuh komputer tidak dihitung.
- **Game.** Saat sebuah game mulai dia menyapa (nama game dikenali dari daftar game populer,
  folder instalasi Steam dan Epic, atau judul jendela), dan setelah 90 menit bermain dia mengingatkan
  untuk peregangan, lalu tiap sejam.
- **Transparan.** Menu tray dan Pengaturan menampilkan apa yang sedang dia lihat, misalnya
  "bermain Roblox" atau "media sosial (Instagram)", beserta rekap durasi per kategori selama sesi
  berjalan, tanpa judul jendelanya.

Di mode **Full** (memerlukan persetujuan terpisah), Aemeath juga melakukan:

- **Konteks ngoding & kerja (tanpa tangkapan layar).** Mengenali bahasa pemrograman dan berkas tes dari ekstensi
  di judul editor (tanpa menyimpan nama berkasnya), menyapa saat kamu mulai ngoding, mengomentari tes, mengingatkan
  fokus tiap 45 menit, dan menegur kalau kamu berpindah aplikasi terlalu cepat.
- **Penilaian pekerjaan (`/review`).** Memeriksa `git status` dan `git diff` 100% secara lokal untuk merangkum berkas
  yang berubah, cakupan tes, sisa `console.log`, `TODO`/`FIXME`, serta memperingatkan bila ada potensi kebocoran API key
  atau berkas `.env`. Tidak ada data diff atau berkas yang dikirim ke internet.

Pengelompokannya memakai kata kunci pada judul halaman, jadi sesekali bisa meleset (misalnya situs yang
tidak dikenal dianggap browser biasa). Mode ini tidak membaca isi halaman, alamat situs, layar, atau ketikanmu.

**Perilaku Focus Companion 2.0 per Mode Interaktif:**
- **Low:** seluruh alat produktivitas (`/timer`, `/focus`, `/todo`, `/quest`, `/note`, `/stats`) berjalan murni manual; tanpa sesi proaktif, tanpa pelacakan aktivitas kerja di `/stats`, dan tanpa sapaan kelanjutan kerja proaktif.
- **Medium:** memantau kategori aplikasi aktif tanpa membaca judul sensitif, merekam durasi per kategori di `/stats`, menawarkan pengingat istirahat/timer saat sesi kerja panjang terdeteksi, mengizinkan celetukan desktop, serta menyapa dan menawarkan kelanjutan tugas tertunda (Resume Work) maksimal satu kali per 6 jam.
- **Full** *(butuh persetujuan eksplisit):* menghubungkan seluruh konteks kerja (bahasa kode, pengujian, penilaian git lokal via `/review`, sesi AI Claude Code/Antigravity, sesi fokus terorkestrasi `/focus`, timer, `/todo`, dan `/quest`), serta secara proaktif menawarkan penyimpanan ringkasan sesi kerja faktual ke memori companion yang hanya disimpan jika kamu menekan tombol "Simpan".

### Fleet Snowfluff GPT (ngobrol dengan Aemeath)

- **Celetukan.** Sesekali Aemeath menyapamu sendiri, dalam Bahasa Indonesia dan dengan
  kepribadiannya: ada baris khusus saat sesi AI berjalan, musik diputar, pagi hari, atau lewat
  tengah malam, dan saat ada keputusan yang menunggu. Jedanya diatur dengan slider di
  Pengaturan (rata-rata 1 sampai 15 menit, bawaan 3,5), dan bisa dimatikan.
- **Trivia Wuthering Waves berkredit & bisa diperbarui.** Saat mengobrol sendiri, Aemeath selalu menceritakan
  trivia lore acak Wuthering Waves dari `lorebook/` (74 entri parafrasa bawaan tentang Solaris-3, Lore,
  Resonator, dan Aemeath, dari 13 sumber) dengan baris "Sumber: ..." di bawahnya. Di Pengaturan (tab *Umum*),
  tersedia tombol **Perbarui Wiki** untuk mengambil dan menyinkronkan data terbaru dari Wuthering Waves Wiki
  kapan saja.
- **Kotak chat di samping Aemeath.** Klik Aemeath (atau pilih "Fleet Snowfluff GPT..." di
  tray), ketik, tekan Enter. Esc menutup, tombol ↺ memulai percakapan baru. Tidak ada jendela
  terpisah. Kotaknya muncul di atas, di bawah, atau di samping Aemeath, mana yang paling lega, supaya
  daftar pesannya tetap nyaman dibaca dan tidak menutupinya. Tombol □ memperbesar kotaknya.
- **Persona.** Chat memakai API DeepSeek (`deepseek-flash` atau `deepseek-v4-pro`). Aemeath
  menjawab sebagai dirinya: ceria, jahil, hangat, memperlakukan Rover seperti sosok wali, dan
  mengutamakan info Wuthering Waves yang akurat. Topik lain boleh dibahas dengan gayanya. Kalau
  tidak yakin, dia bilang terus terang dan tidak mengarang. Lorebook ikut jadi bahan jawaban.
- **Ramah segala usia.** Persona melarang konten dewasa, ditambah penyaring di komputer yang
  mengalihkan pesan tidak pantas sebelum dikirim dan mengganti balasan yang tidak pantas.
- **Pencarian web (opsional).** Untuk pertanyaan informasi, Aemeath mencari dulu di Wuthering
  Waves Wiki (soal game) atau Wikipedia (topik lain), memadukan hasilnya dengan gayanya, dan
  menampilkan sumbernya. Ini pencarian ensiklopedia, bukan mesin pencari umum.
- **Mode pendamping (`/change-mode-search`).** Aemeath tidak lagi terpaku pada wiki Wuthering Waves
  dan menjadi pendamping penuh untuk topik apa pun sesuai konteks: ngoding, resep masakan, belajar,
  dan lainnya, dengan jawaban yang lebih tuntas (langkah bernomor, blok kode). Bila pencarian web
  menyala, pertanyaan koding juga dicari di Stack Overflow dan pertanyaan masak di Wikibooks Cookbook
  (lalu Wikipedia sebagai cadangan), lengkap dengan sumbernya. Hanya bisa dinyalakan saat API key
  tersimpan; tanpa kunci, mode ini tidak berlaku dan Aemeath tetap menjawab dari lorebook. Pilihannya
  disimpan, dan `/change-mode-search off` (atau ketik perintahnya lagi) mengembalikan mode wiki.
- **Mode offline.** Tanpa API key atau saat internet putus, Aemeath tetap menjawab dari
  lorebook. Kalau dia tidak tahu, dia menyuruhmu mencari di internet atau mengisi API key.
- **Penyedia chat bisa ditambah.** Cukup satu berkas di `src/chat/providers/`.

### Perintah kustom dan produktivitas

Ketik `/nama` di kotak chat untuk membuka program, folder, berkas, tautan, paket kerja (beberapa
tujuan sekaligus), atau menjalankan perintah PowerShell, misalnya `/invoice` untuk folder invoice,
`/wuwa` untuk launcher game, atau `/matikan` untuk mematikan komputer. Ketik `/` untuk melihat daftar,
Tab melengkapi nama, `/help` menampilkan daftar perintah. Perintah dijalankan di komputer ini dan tidak
dikirim ke chatbot. Program `.exe` bisa diberi argumen.

**Perintah bawaan produktivitas**:
- `/timer` — pasang timer fokus atau Pomodoro (mis. `/timer 25m Fokus`, `/timer pomodoro`, `/timer status`, `/timer batal`). Saat selesai Aemeath melompat dan mengingatkanmu lewat gelembung bicara.
- `/focus` — orkestrasi sesi fokus kerja (`/focus 25m <tugas>`, `/focus status`, `/focus selesai`, `/focus batal`), mencatat waktu, progres sesi AI, dan review git tanpa mengarang data.
- `/todo` — kelola daftar tugas cepat lokal (`/todo`, `/todo tambah <tugas>`, `/todo selesai <nomor>|semua`, `/todo fokus <nomor>`, `/todo hapus <nomor>`, `/todo bersih`).
- `/quest` atau `/daily` — kelola maksimal 3 prioritas harian (`/quest tambah <tugas>`, `/quest todo <nomor>`, `/quest selesai <nomor>|semua`, `/quest riwayat`, `/quest bersih`). Tugas yang belum selesai dipertahankan otomatis saat pergantian hari.
- `/note` — simpan dan lihat catatan cepat satu baris (`/note`, `/note <teks>`, `/note hapus <nomor>`, `/note bersih`).
- `/stats` — lihat ringkasan waktu fokus sesi ini (saat mode Medium atau Full menyala), status timer aktif, progres Daily Quest, serta jumlah tugas dan catatan.
- `/chronicle` — ringkasan harian opsional: apa yang dikerjakan, durasi nyata, dan apa yang tersisa (`/chronicle`, `/chronicle aktif`, `/chronicle nonaktif`). Hanya menyajikan fakta lokal yang terverifikasi tanpa skor atau hukuman.
- `/memory` — kelola catatan memori companion langsung dari obrolan (`/memory`, `/memory hapus <nomor>`, `/memory aktif`, `/memory nonaktif`).
- `/review` — periksa dan nilai perubahan git lokal (`git status` dan `git diff`) 100% di komputer ini: jumlah berkas kode/tes yang berubah, baris tambah/hapus, sisa `console.log`, `TODO`/`FIXME`, serta deteksi potensi kebocoran API key atau berkas `.env`.
- `/change-mode` — ganti kotak chat antara mode obrolan dan terminal PowerShell.
- `/change-mode-search` — nyalakan/matikan mode pendamping (topik apa saja, bukan cuma wiki). Butuh API key. Juga menerima `on`, `off`, dan `status`.
- `/search <kata kunci>` — pemicu pencarian web manual eksplisit dengan sumber tautan terverifikasi (menghentikan jawaban jika tidak ada sumber valid yang ditemukan).

Semua nama perintah bawaan dicadangkan, jadi perintah kustom dengan nama yang sama ditolak.

**Perintah Shell (PowerShell di Windows / Bash di Linux Mint)** diatur di Pengaturan,
tab *Perintah*, pilih jenis "Jalankan perintah PowerShell" (atau "Jalankan perintah Shell (Bash)" saat berjalan di Linux Mint) atau mulai dari contoh siap pakai yang menyesuaikan OS:
matikan atau restart dengan hitung mundur 60 detik, `/batal` untuk membatalkannya, kunci layar (`LockWorkStation` di Windows atau `cinnamon-screensaver-command` / `xdg-screensaver` di Linux Mint), lima proses terberat, dan cek pembaruan paket APT di Linux Mint. Jalur tujuan juga mendukung variabel lingkungan Windows (`%USERPROFILE%`) maupun Linux (`~/...`, `$HOME/...`). Perintahnya satu baris, berjalan sebagai kamu (bukan admin/root), dihentikan setelah
30 detik, dan keluarannya tampil di kotak chat. Aemeath selalu bertanya "ya" dulu (batas 30 detik) untuk
perintah yang bisa mematikan, menghapus, memformat, atau mengunduh lalu menjalankan sesuatu. Pertanyaan
itu tidak bisa dimatikan untuk perintah berisiko, dan untuk perintah lain tersedia kotak "Tanya dulu".

### Memori companion

Aemeath bisa mengingat sedikit hal tentang pekerjaanmu, kalau kamu izinkan. Semua diatur di
Pengaturan, tab *Memori*.

- **Yang disimpan**: proyek yang sedang dikerjakan, tugas yang belum selesai, keputusan desain,
  cara kamu suka diajak bicara, dan langkah berikutnya yang kamu setujui. Maksimal 200 entri; saat
  penuh, entri baru ditolak, bukan menghapus yang lama diam-diam.
- **Asal-usulnya jelas**: entri yang kamu tulis sendiri ditandai "dari kamu" dan tidak pernah
  dibersihkan otomatis. Ringkasan dari Aemeath hanya tersimpan kalau kamu menekan **Simpan** pada
  balon tawarannya, dan ditandai "ringkasan AI yang kamu setujui".
- **Bukan lorebook.** Fakta canon Wuthering Waves tetap dari lorebook bersumber; memori tidak pernah
  mengubah canon, dan kalau keduanya bertentangan, canon yang menang.
- **Yang dikirim ke model** hanya potongan yang berhubungan dengan pesanmu, paling banyak empat baris
  dan sekitar 700 karakter. Kotak chat menuliskan berapa catatan yang ikut dipakai di bawah jawaban.
- **Kendali penuh**: lihat, ubah, hapus satu per satu, hapus semua, atau matikan penyimpanan. Saat
  dimatikan, tidak ada yang disimpan dan tidak ada memori yang ikut ke model.
- **Mode interaktif tetap mengaturnya**: Low hanya memakai memori saat kamu memulai obrolan; Medium
  boleh menawarkan kelanjutan proyek, paling sering sekali per enam jam; Full menawarkan menyimpan
  ringkasan setelah sesi AI selesai. Semua tawaran tunduk pada jeda, batas per jam, Focus Mode, dan
  sakelar "Jeda interaksi proaktif".
- **Tanpa internet tetap jalan**: jawaban offline boleh mengutip catatan yang relevan.
- Tersimpan di `memory.json` (versi 1) di folder data aplikasi. Berkas yang tidak terbaca dipindahkan
  ke `memory.corrupt-<waktu>.json`, bukan ditimpa; berkas dari versi Aemeath yang lebih baru hanya
  dibaca, tidak ditulis ulang.

### Mode terminal

Ketik `/change-mode` dan kotak chat berubah menjadi terminal (`PowerShell` di Windows, `Bash` di Linux Mint). Sistem operasi lebih dulu meminta
persetujuan admin (UAC di Windows, Polkit `pkexec` di Linux Mint); setelah kamu menyetujuinya, terminal terbuka dan berjalan sebagai
**kamu, bukan sebagai admin/root**. Direktori dan variabel bertahan antar-perintah, keluarannya tampil
di kotak chat (batas 30 detik per perintah dan 20 ribu karakter keluaran). `exit` atau
`/change-mode` lagi kembali ke obrolan. Chatbot tidak ikut campur sama sekali di mode ini.

### Pengaturan dan menu

- **Jendela Pengaturan** (tray → "Pengaturan...") punya empat tab: *Umum* (mode interaktif, celetukan,
  dan slider jedanya), *Chatbot* (penyedia, model, API key, pencarian web, mode offline), *Perintah*
  (perintah bawaan, sakelar mode terminal, dan perintah kustom dengan pemilih berkas dan folder), dan
  *Memori* (daftar memori companion, sakelar penyimpanan, dan aturan retensi).
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
- Perintah PowerShell dikirim sebagai skrip terenkode (bukan baris perintah), tidak boleh meminta hak
  admin (`runas`, `-Verb RunAs`, `sudo` ditolak), dan yang berisiko selalu menunggu "ya" yang kamu ketik.
  Mengetik perintah lain saat pertanyaan masih menunggu membatalkan pertanyaan itu.

**Mode interaktif (Medium dan Full)**
- Mati secara bawaan (bawaan selalu **Low**), dan baru menyala setelah kamu menyetujui penjelasannya.
  Mode Full punya persetujuan terpisah dari Medium. Kembali ke Low menghentikan pembacaan seketika dan
  melupakan semuanya.
- Di mode Medium, yang dibaca hanya nama aplikasi, jalur program (untuk mengenali folder game), dan judul
  jendela yang aktif. Judul dan jalur dibuang segera setelah dipakai mengelompokkan; yang diingat hanya
  kategori, nama aplikasi atau game, dan penghitung waktu, di memori saja.
- Di mode Full, ekstensi berkas di judul editor dipakai untuk mengenali bahasa pemrograman dan apakah itu
  berkas tes (tanpa menyimpan nama berkas atau judulnya). Aemeath tidak pernah menangkap atau merekam layar.
- Perintah `/review` membaca `git status` dan `git diff` lokal secara langsung tanpa shell, menyensor pola
  kunci rahasia (`sk-...`, nilai `API_KEY` di `.env`), dan 100% berjalan lokal tanpa pernah mengirim potongan diff
  atau isi berkas ke penyedia model maupun jaringan internet mana pun.
- Jendela pribadi (incognito, InPrivate), pengelola kata sandi, layar kunci, dan prompt UAC tidak dibaca
  dan tidak pernah diambil cuplikan layarnya.

**Memori companion**
- Aktif secara bawaan dan bisa dimatikan di Pengaturan → *Memori*. Saat dimatikan, penyimpanan dan
  pemakaian konteks berhenti; isi yang sudah ada tidak ikut terhapus.
- Hanya proses utama yang membaca `memory.json`. Jendela Pengaturan boleh menampilkan, mengubah, dan
  menghapusnya; jendela pet hanya boleh menjawab satu tawaran yang sedang tampil.
- API key, token, dan kata sandi ditolak sebelum disimpan, dan teks yang lolos tetap disaring dengan
  pola rahasia yang sama seperti `/review`.
- Memori tidak pernah dikirim seluruhnya. Hanya potongan yang relevan dengan pesan yang sedang
  dikirim, dan itu terjadi sebagai bagian dari permintaan chat ke penyedia yang kamu pilih.
- Kebijakan retensi (30, 90, 180, 365 hari, atau tidak pernah) hanya membersihkan ringkasan sesi dari AI
  (`source: 'assistant'`). Catatan yang kamu tulis sendiri (`source: 'user'`) tidak pernah dihapus
  otomatis agar tidak ada data yang hilang diam-diam, dan hanya bisa dihapus manual lewat tombol Hapus.

**Mode terminal**
- Masuk hanya lewat `/change-mode`, dan itu selalu melewati prompt UAC dari Windows. Tidak ada
  kode di dalam aplikasi yang bisa menyetujuinya untukmu, jadi mode ini tidak bisa menyala diam-diam.
- Terminal berjalan dengan hak akses penggunamu, bukan admin. Tidak ada proses ber-hak-tinggi yang
  hidup lama, dan aplikasinya sendiri tidak pernah dijalankan sebagai admin.
- Hanya teks yang kamu ketik di kotak chat yang sampai ke shell. Balasan chatbot, hasil pencarian,
  dan lorebook tidak bisa mengetik ke terminal.
- Sesi ditutup saat kotak chat ditutup, saat kamu mengetik `exit`, setelah 15 menit diam, atau saat
  aplikasi berhenti (juga bila aplikasi mati mendadak). Perintah dan keluarannya tidak dicatat ke
  disk. Sakelar di Pengaturan bisa mematikan fitur ini sepenuhnya.

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
Pengaturan (termasuk tab Memori), dan perintah kustom dengan balasan, pencarian, dan peluncuran tiruan, lalu menyimpan
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
| `src/activity/`, `scripts/activity-watcher.ps1` | pembaca jendela aktif, pengelompok kategori, dan pelacak peringatan mode Medium |
| `src/commands/` | penyimpanan, penjalan, dan penangan perintah kustom dan bawaan |
| `src/terminal/` | gerbang UAC, sesi PowerShell, dan pengendali mode terminal |
| `src/settings.js` | penyimpanan pengaturan dan migrasi dari nama lama |
| `src/memory/` | penyimpanan memori companion berversi, pemilihan konteks, dan penawaran simpan |
| `assets/pet/` | spritesheet dan atlas (sumber dan lisensi di `NOTICE.md`) |
| `lorebook/` | trivia lore berkredit sumber (lihat `lorebook/README.md`) |
| `tests/` | unit test semua modul di atas |

Status: tahap awal (prototipe). Behavior Director dan Companion Memory sudah berjalan; sisa rencana
beserta konteks teknisnya ada di [ROADMAP.md](ROADMAP.md).

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
