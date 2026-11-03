// Central i18n module for Aemeath.
// UMD so it works with require() in main/preloads/tests and as a script in renderers.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require);
  } else {
    root.AemeathI18n = factory(null);
  }
})(typeof self !== 'undefined' ? self : this, function (nodeRequire) {
  'use strict';

  const SUPPORTED_LOCALES = ['id-ID', 'en-US'];
  const DEFAULT_LOCALE = 'id-ID';

  const defaultCatalogs = {
    'id-ID': {
        "locale": "id-ID",
        "common": {
            "ok": "OK",
            "cancel": "Batal",
            "save": "Simpan",
            "delete": "Hapus",
            "close": "Tutup",
            "retry": "Coba lagi",
            "back": "Kembali",
            "loading": "Memuat...",
            "error": "Kesalahan",
            "success": "Berhasil",
            "warning": "Peringatan"
        },
        "schedule": {
            "usage": "Pakai /jadwal tambah 08:30 harian Minum obat, atau /jadwal tambah 09:00 senin,rabu Rapat. Lainnya: /jadwal (daftar) dan /jadwal hapus 1.",
            "added": "Siap, Rover! Pengingat {time} ({when}) disimpan: {text}",
            "list_header": "Jadwal pengingatmu:",
            "list_row": "{n}. {time} · {when} · {text}",
            "none": "Belum ada jadwal pengingat, Rover.",
            "deleted": "Jadwal nomor {n} dihapus.",
            "not_found": "Nomor jadwal itu tidak ada. Ketik /jadwal untuk melihat daftarnya.",
            "full": "Jadwal sudah penuh (maksimal {max}). Hapus satu dulu ya.",
            "bad_time": "Jamnya harus berbentuk HH:MM, misalnya 08:30.",
            "bad_when": "Harinya harus harian atau nama hari (senin, rabu, ...), boleh dipisah koma.",
            "empty_text": "Tulis isi pengingatnya juga ya, Rover.",
            "secret": "Jangan simpan kunci rahasia di jadwal ya, Rover!",
            "due": "Rover, waktunya: {text}",
            "daily_label": "setiap hari",
            "day_0": "Minggu",
            "day_1": "Senin",
            "day_2": "Selasa",
            "day_3": "Rabu",
            "day_4": "Kamis",
            "day_5": "Jumat",
            "day_6": "Sabtu"
        },
        "github": {
            "usage": "Pakai /github (build), /github pr, atau /github issue. Hanya membaca satu repo yang kamu atur di Pengaturan.",
            "disabled": "Pembaca GitHub sedang mati, Rover. Nyalakan di Pengaturan, tab Umum.",
            "no_repo": "Isi dulu repo-nya di Pengaturan, tab Umum, dengan bentuk owner/nama.",
            "bad_repo": "Nama repo di Pengaturan tidak valid. Pakai bentuk owner/nama.",
            "gh_missing": "Aku tidak menemukan GitHub CLI (gh) di komputer ini. Pasang dulu, lalu login dengan gh auth login.",
            "not_found": "Repo itu tidak ditemukan, atau akunmu tidak boleh melihatnya.",
            "auth": "gh belum login atau tokennya ditolak. Jalankan gh auth login di terminalmu sendiri.",
            "gh_failed": "Permintaan ke GitHub gagal. Coba lagi sebentar lagi.",
            "timeout": "GitHub terlalu lama menjawab, jadi kuhentikan.",
            "bad_output": "Jawaban GitHub tidak bisa kubaca.",
            "runs_header": "Build terbaru:",
            "runs_none": "Belum ada build di repo ini.",
            "run_row": "{name} · {branch} · {state}",
            "pulls_header": "PR terbuka:",
            "pulls_none": "Tidak ada PR terbuka.",
            "pull_row": "#{number} {title} ({author})",
            "draft_mark": "[draft]",
            "issues_header": "Issue terbuka:",
            "issues_none": "Tidak ada issue terbuka.",
            "issue_row": "#{number} {title}",
            "state_success": "berhasil",
            "state_failure": "gagal",
            "state_cancelled": "dibatalkan",
            "state_in_progress": "berjalan",
            "state_queued": "antre",
            "state_skipped": "dilewati",
            "state_timed_out": "kehabisan waktu",
            "state_other": "tidak diketahui"
        },
        "agent": {
            "usage": "Tulis pesanmu setelah /claude ya, Rover. Contoh: /claude jelaskan fungsi parser sesi. Perintah lain: /claude baru, /claude sesi, /claude stop.",
            "disabled": "Jembatan agen sedang mati, Rover. Nyalakan dulu di Pengaturan, tab Umum.",
            "busy": "Masih ada permintaan /claude yang berjalan. Tunggu sebentar atau ketik /claude stop.",
            "not_installed": "Aku tidak menemukan Claude Code di komputer ini, Rover. Pasang dulu atau cek PATH-nya.",
            "auth": "Claude Code belum login atau sesinya habis. Login lagi lewat terminalmu sendiri, lalu coba lagi.",
            "max_turns": "Claude berhenti karena batas langkah tercapai. Coba pecah permintaannya.",
            "timeout": "Claude terlalu lama menjawab, jadi kuhentikan.",
            "api": "Claude Code melaporkan galat dari layanannya. Coba lagi sebentar lagi.",
            "error": "Permintaan ke Claude Code gagal.",
            "no_result": "Claude Code berhenti tanpa jawaban.",
            "spawn_failed": "Claude Code gagal dijalankan.",
            "cancelled": "Permintaan /claude dibatalkan.",
            "invalid_session": "Id sesi yang tersimpan tidak valid. Ketik /claude baru untuk memulai ulang.",
            "new_session": "Siap, percakapan Claude berikutnya mulai dari awal.",
            "no_session": "Belum ada sesi Claude yang berjalan dari Aemeath.",
            "session_id": "Sesi Claude saat ini: {id}. Untuk melanjutkannya di terminalmu, ketik sendiri: claude --resume {id}",
            "stopped": "Permintaan /claude dihentikan.",
            "nothing_running": "Tidak ada permintaan /claude yang sedang berjalan.",
            "bad_dir": "Folder kerja Claude tidak ditemukan. Pilih ulang di Pengaturan, tab Umum, atau kembali ke folder home.",
            "denied": "Claude ingin melakukan: {list}.",
            "approve_hint": "Ketik /claude ya untuk mengizinkan sekali, atau abaikan saja. Izin habis dalam 5 menit.",
            "denied_blocked": "Jenis aksi ini tidak bisa diizinkan dari sini, jadi ditolak otomatis.",
            "nothing_to_approve": "Tidak ada permintaan edit yang menunggu izin.",
            "mode_on": "Mode Claude aktif, Rover. Semua yang kamu ketik sekarang kuteruskan ke Claude di folder {name}. Ketik ya untuk menyetujui edit yang tertunda, stop untuk menghentikan, atau /claude-mode untuk keluar.",
            "step_start": "Aemeath meneruskan pesanmu ke Claude…",
            "step_thinking": "Claude sedang menimbang…",
            "step_read": "Membaca",
            "step_search": "Mencari",
            "step_edit": "Mencoba mengedit",
            "step_write": "Mencoba menulis",
            "step_bash": "Mencoba menjalankan perintah",
            "step_web": "Membuka web",
            "step_other": "Memakai alat {name}",
            "sum_header": "Langkah Claude:",
            "sum_read": "membaca {n}x",
            "sum_search": "mencari {n}x",
            "sum_edit": "mencoba mengedit {n}x",
            "sum_write": "mencoba menulis {n}x",
            "sum_bash": "mencoba menjalankan perintah {n}x",
            "sum_web": "membuka web {n}x",
            "sum_other": "alat lain {n}x",
            "sessions_header": "Sesi di folder kerja ini, terbaru dulu:",
            "session_row": "{n}. {id} ({age})",
            "session_row_titled": "{n}. {title} · {id} ({age})",
            "sessions_none": "Belum ada sesi di folder kerja ini.",
            "sessions_use": "Ketik /claude lanjut 1 (atau nomor lain) untuk melanjutkannya dari sini.",
            "session_adopted": "Siap, /claude berikutnya melanjutkan sesi {id}.",
            "session_not_found": "Nomor sesi itu tidak ada. Ketik /claude sesi untuk melihat daftarnya.",
            "session_active": "Sesi itu baru saja dipakai dan mungkin masih terbuka di jendela lain. Tunggu semenit atau tutup dulu sesinya, lalu coba lagi.",
            "interrupted": "Terputus karena Aemeath ditutup saat permintaan berjalan.",
            "age_now": "baru saja",
            "age_minutes": "{n} menit lalu",
            "age_hours": "{n} jam lalu",
            "age_days": "{n} hari lalu"
        },
        "settings": {
            "title": "Pengaturan Aemeath",
            "os_badge": "Lingkungan sistem: {os}",
            "tabs": {
                "general": "Umum",
                "chatbot": "Chatbot",
                "commands": "Perintah",
                "memory": "Memori",
                "appearance": "Tampilan"
            },
            "language": {
                "title": "Bahasa",
                "label": "Bahasa antarmuka & asisten",
                "hint": "Pilih bahasa untuk antarmuka Aemeath dan tanggapan asisten.",
                "id": "Bahasa Indonesia",
                "en": "English"
            },
            "interactive": {
                "title": "Mode interaktif",
                "low_title": "Low",
                "low_desc": "Aemeath mengajakmu mengobrol dan berbicara seperti biasa.",
                "medium_title": "Medium",
                "medium_desc": "Aemeath boleh melihat aplikasi yang sedang kamu pakai (browsing, main game, dan lain-lain) dan memperingatkanmu kalau kelamaan doomscrolling.",
                "full_title": "Full",
                "full_badge": "Baru",
                "full_desc": "Lebih intens dari Medium: Aemeath mendeteksi program yang kamu buka, media sosial, bahasa pemrograman & berkas test saat ngoding, berpindah-pindah jendela, serta menilai pekerjaanmu (/review) tanpa menangkap layar.",
                "medium_consent_title": "Sebelum menyalakan Medium, ini yang terjadi:",
                "medium_consent_1": "Setiap beberapa detik Aemeath membaca nama aplikasi dan judul jendela yang sedang aktif.",
                "medium_consent_2": "Judul langsung dibuang setelah dipakai menebak jenis kegiatan (medsos, game, ngoding, dan seterusnya). Yang diingat hanya kategori dan nama aplikasi atau game, dan hanya di memori.",
                "medium_consent_3": "Tidak ada yang disimpan ke disk atau dikirim ke internet, termasuk ke chatbot.",
                "medium_consent_4": "Jendela pribadi (incognito, InPrivate), pengelola kata sandi, dan layar kunci tidak dibaca.",
                "medium_consent_5": "Kamu bisa kembali ke Low kapan saja, dan pembacaannya langsung berhenti.",
                "medium_accept": "Aktifkan Medium",
                "medium_cancel": "Batal",
                "full_consent_title": "Sebelum menyalakan Full, ini yang terjadi:",
                "full_consent_1": "Mencakup semua pembacaan Medium (mendeteksi program yang dibuka dan media sosial), ditambah deteksi bahasa pemrograman dan berkas test saat kamu ngoding, serta pengingat bila kamu terlalu sering berpindah jendela.",
                "full_consent_2": "Tidak pernah menangkap atau merekam layar (ringan di CPU/RAM).",
                "full_consent_3": "Jendela pribadi (incognito, InPrivate), pengelola kata sandi, layar kunci, dan prompt UAC tetap dilewati dan tidak pernah dibaca.",
                "full_consent_4": "Perintah /review memeriksa status git diff 100% secara lokal di komputer ini dan mendeteksi bila ada potensi kebocoran API key atau berkas .env. Tidak ada data aktivitas atau kodingan yang pernah dikirim ke internet.",
                "full_accept": "Aktifkan Full",
                "full_cancel": "Batal",
                "doom_label": "Ingatkan kalau scroll medsos",
                "doom_unit": "{minutes} menit"
            },
            "startup": {
                "title": "Startup",
                "toggle": "Jalankan Aemeath otomatis saat Windows menyala",
                "hint": "Aktif secara bawaan, jadi Aemeath langsung muncul setiap kali kamu menyalakan komputer. Matikan di sini kalau tidak mau; entri startup-nya langsung dihapus."
            },
            "github": {
                "title": "GitHub (hanya-baca)",
                "toggle": "Aktifkan perintah /github",
                "repo_label": "Repo (owner/nama)",
                "saved": "Tersimpan.",
                "invalid": "Bentuknya harus owner/nama, jadi tidak disimpan.",
                "hint": "Mati secara bawaan. Aemeath membaca build, PR terbuka, dan issue terbuka dari satu repo lewat GitHub CLI (gh) milikmu. Yang dikirim hanya nama repo dan login gh-mu; Aemeath tidak menyimpan token dan tidak menulis apa pun ke GitHub. Hasilnya hanya ditampilkan."
            },
            "agent": {
                "title": "Jembatan agen AI",
                "toggle": "Aktifkan perintah /claude (Claude Code)",
                "dir_label": "Folder kerja Claude",
                "dir_none": "Folder home",
                "dir_pick": "Pilih folder...",
                "dir_clear": "Pakai folder home",
                "purge_button": "Hapus data modul...",
                "purge_hint": "Menghapus catatan tugas dan pilihan folder kerja, lalu mematikan modul ini. Riwayat obrolan, persona, bahasa, dan memori tidak disentuh. Sesi Claude Code milikmu sendiri juga tidak dihapus.",
                "purge_confirm": "Hapus data modul agen AI? Permintaan yang sedang berjalan dihentikan, catatan tugas dan pilihan folder kerja dihapus, dan modul dimatikan. Riwayat obrolan, persona, dan bahasa tetap aman. Tindakan ini tidak bisa dibatalkan.",
                "purge_done": "Data modul agen AI sudah dihapus dan modul dimatikan.",
                "tasks_title": "Tugas agen terbaru",
                "tasks_refresh": "Segarkan",
                "tasks_stop": "Hentikan yang berjalan",
                "tasks_none": "Belum ada tugas.",
                "tasks_seconds": "{n} dtk",
                "tasks_attempt": "percobaan {n}",
                "status_pending": "Menunggu",
                "status_planning": "Merencanakan",
                "status_awaiting_approval": "Menunggu izin",
                "status_running": "Berjalan",
                "status_succeeded": "Selesai",
                "status_failed": "Gagal",
                "status_cancelled": "Dibatalkan",
                "hint": "Mati secara bawaan. Aemeath menjalankan Claude Code di komputermu atas pesan yang kamu ketik sendiri, untuk membaca dan menjawab. File baru diedit setelah kamu mengetik /claude ya, dan menjalankan perintah selalu ditolak. Pesanmu dikirim ke layanan Claude lewat login Claude Code milikmu. Aemeath tidak menyertakan data aktivitasmu. Claude bisa membaca isi folder kerja yang kamu pilih, jadi pilih folder proyek, bukan folder berisi data pribadi."
            },
            "movement": {
                "title": "Gerak & tampilan",
                "stay_still": "Diam di tempat (tidak berjalan atau melayang)",
                "transparent": "Mode tembus pandang (klik mouse menembus pet)",
                "transparent_hint": "Klik mouse akan menembus Aemeath ke jendela di belakangnya. Berguna kalau kamu sering salah klik saat dia lewat di atas tombol atau teks. Gunakan menu tray untuk mematikannya kembali.",
                "opacity": "Transparansi pet",
                "opacity_label": "Opacity sprite saat mode transparan",
                "opacity_min": "tipis (15%)",
                "opacity_max": "jelas (100%)",
                "stay_still_hint": "Aemeath berhenti terbang berkeliling dan tetap di posisinya sekarang. Kamu masih bisa menyeretnya ke tempat lain, dan dia tetap berbicara dan bereaksi. Bisa juga diganti dari menu tray."
            },
            "chatter": {
                "title": "Celoteh",
                "toggle": "Izinkan Aemeath berceloteh sesekali",
                "interval": "Jeda rata-rata celoteh",
                "interval_unit": "{minutes} menit",
                "proactive_pause": "Jeda sementara semua celoteh proaktif",
                "max_per_hour": "Batas celoteh per jam",
                "cooldown": "Jeda kategori yang sama",
                "cooldown_unit": "{minutes} menit",
                "quiet_hours": "Jam tenang (tanpa celoteh spontan)",
                "quiet_hours_start": "Mulai",
                "quiet_hours_end": "Selesai",
                "toggle_label": "Aemeath boleh mengajakmu bicara",
                "interval_label": "Jeda antar celetukan",
                "frequent": "sering",
                "rare": "jarang"
            },
            "chatbot": {
                "title": "Chatbot & Model",
                "provider": "Penyedia model",
                "model": "Pilihan model",
                "streaming": "Tampilkan jawaban kata demi kata (streaming)",
                "web_search": "Boleh cari info di web jika diperlukan",
                "offline_fallback": "Gunakan jawaban lokal jika internet/kunci bermasalah",
                "shortcut": "Pintasan buka chat",
                "api_key": "Kunci API",
                "api_key_placeholder": "Masukkan kunci API...",
                "save_key": "Simpan kunci",
                "clear_key": "Hapus kunci",
                "key_saved": "Kunci API tersimpan dengan aman.",
                "key_cleared": "Kunci API dihapus.",
                "provider_label": "Penyedia",
                "model_label": "Model",
                "web_search_label": "Cari di web agar jawaban lebih akurat",
                "web_search_hint": "Memakai Wuthering Waves Wiki untuk pertanyaan game dan Wikipedia untuk topik lain. Kata kunci pertanyaanmu dikirim ke situs itu, lalu hasilnya ikut dijadikan bahan jawaban dengan sumber tertera. Bukan mesin pencari umum.",
                "offline_label": "Tetap ngobrol tanpa kunci atau internet",
                "offline_hint": "Saat kunci belum ada atau internet putus, Aemeath menjawab dari lorebook yang tersimpan. Kalau dia tidak tahu, dia menyuruhmu mencari di internet atau mengisi API key.",
                "streaming_label": "Mode streaming teks (muncul kata demi kata)",
                "streaming_hint": "Menampilkan ketikan teks secara langsung (streaming) saat model AI sedang merespons. Matikan jika kamu lebih suka pesan muncul sekaligus setelah selesai.",
                "key_label": "Kunci API",
                "key_placeholder": "Tempel kunci di sini",
                "key_save": "Simpan kunci",
                "key_clear": "Hapus kunci",
                "key_hint_1": "Kunci hanya disimpan di komputer ini, terenkripsi lewat penyimpanan kredensial sistem, di luar folder proyek. Kunci tidak pernah dikirim ke repo, ke jendela lain, atau ke siapa pun selain penyedia.",
                "key_hint_2": "Pesan yang kamu ketik di kotak chat dikirim ke penyedia untuk dijawab. Riwayat percakapan hanya ada di memori dan dilupakan beberapa menit setelah kotak chat ditutup."
            },
            "commands": {
                "title": "Perintah kustom",
                "hint": "Buat pintasan perintah sendiri untuk membuka aplikasi, URL, atau menjalankan skrip.",
                "add": "Tambah perintah",
                "table_name": "Nama",
                "table_type": "Jenis",
                "table_target": "Target / Skrip",
                "table_actions": "Aksi",
                "builtin_title": "Perintah bawaan",
                "builtin_hint": "Perintah ini sudah tertanam di Aemeath. Namanya dicadangkan, jadi perintah kustom dengan nama yang sama ditolak.",
                "builtin_focus": "Orkestrasi sesi fokus kerja (mis. /focus 25m Tugas, /focus status).",
                "builtin_quest": "Kelola maksimal 3 prioritas harian (/quest tambah ..., alias /daily).",
                "builtin_chronicle": "Ringkasan harian opsional dari fakta lokal (/chronicle aktif).",
                "builtin_memory": "Kelola catatan memori companion (/memory, /memory hapus 1).",
                "builtin_feature": "Buka Aemeath Guidebook, buku panduan fitur.",
                "builtin_claude": "Tanya Claude Code dari kotak chat. Mati secara bawaan, nyalakan di tab Umum (/claude stop, /claude sesi).",
                "builtin_jadwal": "Pengingat berulang lokal (mis. /jadwal tambah 08:30 harian Minum obat).",
                "builtin_claude_mode": "Ubah Aemeath jadi agen Claude: semua yang kamu ketik diteruskan ke Claude (/claude-mode lagi untuk keluar).",
                "terminal_toggle": "Izinkan mode terminal",
                "terminal_hint": "Saat /change-mode dipakai, Windows meminta persetujuan admin (UAC) lebih dulu. Setelah disetujui, kotak chat menjadi PowerShell yang berjalan sebagai kamu, bukan sebagai admin, dan hanya perintah yang kamu ketik sendiri yang dijalankan. Chatbot tidak ikut campur, dan sesi berakhir saat kotak ditutup, saat kamu mengetik exit, atau setelah 15 menit diam.",
                "custom_title": "Perintah kustom",
                "custom_intro_hint": "Ketik /nama di kotak chat untuk membuka program, folder, atau tautan, atau menjalankan perintah PowerShell, misalnya /invoice untuk folder invoice, /wuwa untuk launcher game, atau /matikan untuk mematikan komputer. Ketik / saja untuk melihat daftarnya. Perintah dijalankan di komputer ini saja: tidak dikirim ke chatbot, dan hanya teks yang kamu ketik sendiri yang bisa memicunya.",
                "add_btn": "Tambah perintah",
                "preset_label": "Atau mulai dari contoh",
                "preset_btn": "Tambah contoh",
                "target_hint": "Tujuan bisa berupa jalur lengkap ke program, berkas, atau folder (boleh memakai %USERPROFILE%), atau tautan http:// / https://. Argumen hanya berlaku untuk program berekstensi .exe.",
                "shell_hint": "Perintah PowerShell dijalankan sebagai kamu (bukan admin), satu baris, dan dihentikan setelah 30 detik. Aemeath selalu bertanya \"ya\" dulu untuk perintah yang bisa mematikan, menghapus, memformat, atau mengunduh lalu menjalankan sesuatu, dan kamu tidak bisa mematikan pertanyaan itu. Contoh /matikan memakai hitung mundur 60 detik yang bisa dibatalkan dengan /batal."
            },
            "memory": {
                "title": "Memori companion",
                "description": "Hal-hal yang diizinkan untuk diingat oleh Aemeath saat mengobrol bersamamu.",
                "clear_all": "Hapus semua memori",
                "empty": "Belum ada catatan memori tersimpan.",
                "hint": "Hal-hal yang kamu izinkan untuk Aemeath ingat: proyek yang sedang kamu kerjakan, tugas yang belum selesai, keputusan desain, dan cara kamu suka diajak bicara. Memori ini terpisah dari lorebook: fakta Wuthering Waves tetap berasal dari wiki, dan memori tidak pernah mengubah canon.",
                "toggle": "Izinkan Aemeath menyimpan memori",
                "toggle_hint": "Saat dimatikan, tidak ada yang disimpan dan tidak ada memori yang ikut dikirim ke model. Memori yang sudah ada tetap bisa kamu lihat dan hapus di bawah.",
                "retention_label": "Ringkasan dari AI dibersihkan setelah",
                "retention_hint": "Hanya ringkasan yang Aemeath buat sendiri yang mengikuti aturan ini. Memori yang kamu tulis sendiri tidak pernah dibersihkan otomatis.",
                "new_placeholder": "Misalnya: di aemeath-ai-agent aku sedang menggarap memori companion sebelum Focus Companion 2.0.",
                "kind_project": "Proyek",
                "kind_task": "Tugas",
                "kind_decision": "Keputusan",
                "kind_preference": "Preferensi",
                "kind_next_step": "Langkah berikutnya",
                "kind_context": "Konteks",
                "save_btn": "Simpan",
                "cancel_btn": "Batal",
                "add_btn": "Tambah memori",
                "clear_btn": "Hapus semua",
                "privacy_hint": "Saat kamu mengirim pesan, hanya potongan memori yang berhubungan dengan pesan itu — paling banyak empat baris — yang ikut ke model, bukan seluruh daftar. Semuanya tersimpan di memory.json di folder data aplikasi; berkas itu boleh kamu hapus sendiri kapan saja."
            },
            "appearance": {
                "title": "Tampilan & Tema",
                "hint": "Pilih tema bawaan atau sesuaikan warna, frosted blur, dan transparansi kaca secara langsung. Perubahan diterapkan seketika ke seluruh jendela (companion, chat, pengaturan, dan guidebook).",
                "theme_label": "Pilihan tema",
                "preset_label": "Preset kaca",
                "blur_label": "Kekaburan Frosted (Blur px)",
                "opacity_label": "Opasitas kaca",
                "hue_label": "Rona Warna (Hue 0° - 360°)",
                "preview_title": "Pratinjau Kaca Langsung",
                "preview_card_title": "Aemeath Companion",
                "preview_sample_btn": "Uji Tombol",
                "contrast_optimal": "Kualitas kontras optimal: WCAG AA lolos.",
                "contrast_autofix": "Perbaiki otomatis",
                "base_mode": "Mode Dasar",
                "dark": "Gelap",
                "dark_desc": "Latar tembus pandang malam.",
                "light": "Terang",
                "light_desc": "Latar kaca putih bersinar lembut.",
                "system": "Sistem",
                "system_desc": "Mengikuti tema Windows / OS.",
                "reduce_effects": "Kurangi efek visual (tanpa blur, opasitas padat, minim animasi)",
                "presets_title": "Tema Bawaan (Preset)",
                "reset_preset": "Reset ke Preset",
                "preset_hint": "Menggeser slider otomatis mengubah tema menjadi Kustom. Klik dua kali pada slider untuk reset ke nilai bawaan.",
                "color_title": "Pengaturan Warna Aksen (Ruang OKLCH)",
                "chroma_label": "Intensitas Warna (Chroma)",
                "lightness_label": "Kecerahan Warna (Lightness)",
                "frosted_title": "Pengaturan Frosted & Transparansi Kaca",
                "glass_opacity": "Transparansi Kaca (Opasitas %)",
                "radius_label": "Sudut Membulat (Radius px)",
                "border_label": "Kekuatan Garis Tepi (Border %)",
                "typography_title": "Tipografi",
                "scale_label": "Skala Ukuran Teks (%)",
                "export_btn": "Ekspor Tema (JSON)",
                "import_btn": "Impor Tema...",
                "export_hint": "Berkas tema yang diekspor berformat JSON aman dan dapat dibagikan atau dipasang kembali kapan saja."
            },
            "os_detected": "Lingkungan sistem terdeteksi: {os} (shell: {shell})",
            "shortcut_section": {
                "title": "Pintasan keyboard",
                "label": "Panggil atau tutup kotak chat dari mana saja",
                "hint": "Tekan pintasan ini kapan saja untuk langsung mengetik pesan atau menjalankan perintah /nama tanpa mengklik Aemeath."
            },
            "proactive": {
                "title": "Interaksi proaktif",
                "pause": "Jeda semua interaksi proaktif",
                "pause_hint": "Saat aktif, Aemeath berhenti menyapa dan berkomentar sendiri. Pengingat yang kamu jadwalkan sendiri lewat /timer dan pemberitahuan penting sesi AI tetap muncul. Sakelar yang sama ada di menu tray.",
                "cap_label": "Batas reaksi proaktif per jam",
                "cooldown_label": "Jeda setelah satu jenis reaksi",
                "cooldown_hint": "Batas ini berlaku untuk reaksi tentang aktivitasmu, bukan untuk celetukan yang jedanya kamu atur di atas. Yang lebih penting selalu menang: keputusan sesi AI, sesi gagal, permintaanmu, timer selesai, reaksi aktivitas, lalu celetukan. Celetukan ditunda saat kamu mengetik di kotak chat, saat komputer idle, dan saat timer fokus berjalan.",
                "ladder_label": "Urutan prioritas notifikasi (1 = tertinggi, 6 = terendah)",
                "prio_decision": "Keputusan sesi AI",
                "prio_failure": "Sesi AI gagal / berhenti",
                "prio_direct": "Permintaan langsung & memori",
                "prio_productivity": "Timer & sesi selesai",
                "prio_activity": "Aktivitas & tawaran memori",
                "prio_chatter": "Obrolan santai & trivia",
                "prio_hint": "Ubah urutan ini jika ingin suatu kategori (misalnya timer atau celetukan) lebih diutamakan atau ditunda saat beberapa pesan datang bersamaan.",
                "dnd_toggle": "Aktifkan jam tenang (Do Not Disturb)",
                "dnd_start": "Mulai",
                "dnd_end": "Sampai",
                "dnd_hint": "Selama jam tenang, Aemeath tidak akan menyapa atau mengobrol santai. Pemberitahuan penting (seperti keputusan sesi AI dan timer) tetap diizinkan muncul."
            },
            "lorebook": {
                "title": "Data Lorebook & Wiki Wuthering Waves",
                "hint": "Aemeath selalu mengobrolkan fakta acak Wuthering Waves dari lorebook lokal yang tersedia. Kamu bisa memperbarui data dari Wuthering Waves Wiki kapan saja (kosongkan kolom untuk memperbarui halaman utama seperti Solaris-3, Lore, dan Resonator, atau isi judul/URL halaman tertentu).",
                "placeholder": "Contoh: Solaris-3, Lore, Rinascita (opsional)",
                "update_btn": "Perbarui Wiki"
            }
        },
        "chat": {
            "folder_button_title": "Folder kerja Claude",
            "folder_home": "Folder home",
            "folder_pick": "Pilih folder lain...",
            "folder_busy": "Tunggu permintaan /claude selesai dulu.",
            "folder_changed": "Claude sekarang bekerja di {name}. Percakapan Claude dimulai dari awal.",
            "folder_error": "Folder itu tidak bisa dipakai.",
            "agent_pending": "Aemeath sedang menghubungi Claude...",
            "claude_mode_badge": "Claude",
            "claude_placeholder": "Tulis tugas untuk Claude...",
            "claude_mode_off": "Keluar dari mode Claude. Kita ngobrol biasa lagi, ya~",
            "claude_mode_already": "Mode Claude sudah aktif.",
            "claude_mode_not_on": "Mode Claude sedang tidak aktif.",
            "claude_mode_ended": "Modul Claude dimatikan, jadi mode Claude berakhir.",
            "claude_mode_terminal": "Keluar dari mode terminal dulu (ketik exit), baru nyalakan mode Claude.",
            "session_button_title": "Sesi Claude",
            "session_label": "Sesi {id}",
            "session_none": "Sesi baru",
            "session_new": "Mulai sesi baru",
            "session_new_done": "Sesi Claude baru dimulai. Pesan berikutnya membuka percakapan baru.",
            "session_changed": "Claude melanjutkan sesi {id}.",
            "placeholder": "Tulis pesan untuk Aemeath...",
            "send": "Kirim",
            "retry": "Coba lagi",
            "reset": "Reset obrolan",
            "settings": "Pengaturan",
            "empty": "Tulis pesan untuk memulai obrolan dengan Aemeath.",
            "thinking": "Aemeath sedang berpikir...",
            "searching": "Aemeath sedang mencari di web...",
            "local_badge": "Lokal",
            "search_sources": "Sumber:",
            "attach_image": "Lampirkan gambar",
            "remove_image": "Hapus gambar",
            "uploading": "Mengunggah...",
            "unsupported_format": "Format gambar tidak didukung.",
            "offline_notice": "Mode offline: menggunakan catatan lore lokal.",
            "companion_mode": "Mode Pendamping Aktif",
            "wiki_mode": "Mode Wiki Wuthering Waves",
            "greeting": "Hai, Rover! Mau ngobrol apa? Tanya soal Wuthering Waves juga boleh~"
        },
        "feature_guide": {
            "title": "Buku Panduan Aemeath",
            "search_placeholder": "Cari fitur, perintah, atau tips...",
            "no_results": "Tidak ada hasil yang cocok.",
            "dialogue_default": "Rover~! Aku di sini menemanimu membaca panduan.",
            "category_all": "Semua",
            "header_sub": "Panduan Fitur Resmi & Referensi Perintah /feature",
            "mode_pill": "Lokal & Offline",
            "theme_toggle_title": "Ganti Tema (Default / Glassmorphism)",
            "close_title": "Tutup Guidebook (Esc)",
            "search_clear": "Hapus pencarian",
            "nav_header": "Daftar Modul",
            "nav_count": "{count} Topik",
            "sidebar_footer": "Ketik /feature kapan saja",
            "avatar_title": "Klik Aemeath untuk sapaan loncat!",
            "companion_hint": "Klik untuk sapa",
            "footer_left": "Perintah /help dan /bantuan tetap aktif dan tidak berubah.",
            "footer_right": "Gunakan tombol Tab atau Enter untuk navigasi",
            "purpose_title": "Tujuan / Fungsi Utama",
            "usage_title": "Cara Penggunaan & Sintaks",
            "copy": "Salin",
            "copied": "Tersalin!",
            "examples_label": "Contoh Masukan:",
            "requirements_title": "Persyaratan",
            "mode_title": "Kesesuaian Mode",
            "privacy_title": "Privasi & Keamanan Terjamin",
            "reset_btn": "Reset",
            "breadcrumb_prefix": "Aemeath Guidebook > "
        },
        "errors": {
            "network": "Koneksi jaringan terputus. Memeriksa kembali...",
            "timeout": "Waktu tunggu habis. Coba ulangi pertanyaanmu.",
            "busy": "Aemeath masih memikirkan pesan sebelumnya.",
            "empty_input": "Tulis sesuatu dulu, Rover.",
            "empty_search": "Tulis kata kunci setelah /search ya, Rover.",
            "too_long": "Pesannya terlalu panjang (maksimal {max} karakter).",
            "no_key": "Belum ada kunci API {provider}. Atur dulu di Pengaturan.",
            "provider_unknown": "Penyedia chatbot tidak dikenal.",
            "unsupported_vision": "Penyedia {provider} ({model}) tidak mendukung input gambar.",
            "search_failed": "Maaf Rover, pencarian web gagal karena kendala jaringan atau batas waktu. Aku tidak mau menebak tanpa rujukan—coba lagi sebentar ya.",
            "search_empty": "Aku sudah mencari di web, tapi tidak menemukan sumber yang valid untuk \"{query}\", Rover. Aku tidak akan mengarang jawaban tanpa bukti—coba kata kunci yang lebih spesifik ya.",
            "search_secret": "Maaf Rover, pencarian web tidak dapat dijalankan untuk pesan ini.",
            "unknown": "Terjadi kesalahan."
        }
    },
    'en-US': {
        "locale": "en-US",
        "common": {
            "ok": "OK",
            "cancel": "Cancel",
            "save": "Save",
            "delete": "Delete",
            "close": "Close",
            "retry": "Retry",
            "back": "Back",
            "loading": "Loading...",
            "error": "Error",
            "success": "Success",
            "warning": "Warning"
        },
        "schedule": {
            "usage": "Use /jadwal add 08:30 daily Take medicine, or /jadwal add 09:00 monday,wednesday Standup. Others: /jadwal (list) and /jadwal delete 1.",
            "added": "Done, Rover! Reminder saved for {time} ({when}): {text}",
            "list_header": "Your reminders:",
            "list_row": "{n}. {time} · {when} · {text}",
            "none": "No reminders scheduled yet, Rover.",
            "deleted": "Reminder {n} deleted.",
            "not_found": "That reminder number doesn't exist. Type /jadwal to see the list.",
            "full": "The schedule is full (maximum {max}). Delete one first.",
            "bad_time": "The time must look like HH:MM, for example 08:30.",
            "bad_when": "The day must be daily or a weekday name (monday, wednesday, ...), separated by commas.",
            "empty_text": "Write the reminder text too, Rover.",
            "secret": "Don't keep secret keys in the schedule, Rover!",
            "due": "Rover, it's time: {text}",
            "daily_label": "every day",
            "day_0": "Sunday",
            "day_1": "Monday",
            "day_2": "Tuesday",
            "day_3": "Wednesday",
            "day_4": "Thursday",
            "day_5": "Friday",
            "day_6": "Saturday"
        },
        "github": {
            "usage": "Use /github (builds), /github pr, or /github issue. It only reads the one repository you set in Settings.",
            "disabled": "The GitHub reader is off, Rover. Turn it on in Settings, General tab.",
            "no_repo": "Set the repository first in Settings, General tab, as owner/name.",
            "bad_repo": "The repository name in Settings is not valid. Use the form owner/name.",
            "gh_missing": "I can't find the GitHub CLI (gh) on this computer. Install it, then log in with gh auth login.",
            "not_found": "That repository was not found, or your account may not see it.",
            "auth": "gh isn't logged in or its token was rejected. Run gh auth login in your own terminal.",
            "gh_failed": "The request to GitHub failed. Try again in a moment.",
            "timeout": "GitHub took too long to answer, so I stopped it.",
            "bad_output": "I couldn't read GitHub's answer.",
            "runs_header": "Latest builds:",
            "runs_none": "No builds in this repository yet.",
            "run_row": "{name} · {branch} · {state}",
            "pulls_header": "Open pull requests:",
            "pulls_none": "No open pull requests.",
            "pull_row": "#{number} {title} ({author})",
            "draft_mark": "[draft]",
            "issues_header": "Open issues:",
            "issues_none": "No open issues.",
            "issue_row": "#{number} {title}",
            "state_success": "passed",
            "state_failure": "failed",
            "state_cancelled": "cancelled",
            "state_in_progress": "running",
            "state_queued": "queued",
            "state_skipped": "skipped",
            "state_timed_out": "timed out",
            "state_other": "unknown"
        },
        "agent": {
            "usage": "Type your message after /claude, Rover. Example: /claude explain the session parser. Other forms: /claude new, /claude session, /claude stop.",
            "disabled": "The agent bridge is off, Rover. Turn it on first in Settings, General tab.",
            "busy": "A /claude request is still running. Wait a moment or type /claude stop.",
            "not_installed": "I can't find Claude Code on this computer, Rover. Install it or check your PATH.",
            "auth": "Claude Code isn't logged in or its session expired. Log in again from your own terminal, then retry.",
            "max_turns": "Claude stopped because it hit the step limit. Try splitting the request.",
            "timeout": "Claude took too long to answer, so I stopped it.",
            "api": "Claude Code reported an error from its service. Try again in a moment.",
            "error": "The request to Claude Code failed.",
            "no_result": "Claude Code stopped without an answer.",
            "spawn_failed": "Claude Code could not be started.",
            "cancelled": "The /claude request was cancelled.",
            "invalid_session": "The stored session id is not valid. Type /claude new to start over.",
            "new_session": "Done, the next Claude conversation starts from scratch.",
            "no_session": "No Claude session has been started from Aemeath yet.",
            "session_id": "Current Claude session: {id}. To continue it in your terminal, type this yourself: claude --resume {id}",
            "stopped": "The /claude request was stopped.",
            "nothing_running": "No /claude request is running.",
            "bad_dir": "Claude's working folder was not found. Pick it again in Settings, General tab, or go back to the home folder.",
            "denied": "Claude wants to do: {list}.",
            "approve_hint": "Type /claude ya to allow it once, or ignore this. The permission expires in 5 minutes.",
            "denied_blocked": "This kind of action cannot be allowed from here, so it was denied automatically.",
            "nothing_to_approve": "No edit request is waiting for permission.",
            "mode_on": "Claude mode is on, Rover. Everything you type now goes to Claude in the {name} folder. Type ya to approve a pending edit, stop to stop it, or /claude-mode to leave.",
            "step_start": "Aemeath is passing your message to Claude…",
            "step_thinking": "Claude is thinking it over…",
            "step_read": "Reading",
            "step_search": "Searching",
            "step_edit": "Trying to edit",
            "step_write": "Trying to write",
            "step_bash": "Trying to run a command",
            "step_web": "Opening the web",
            "step_other": "Using the {name} tool",
            "sum_header": "Claude's steps:",
            "sum_read": "read {n}x",
            "sum_search": "searched {n}x",
            "sum_edit": "tried to edit {n}x",
            "sum_write": "tried to write {n}x",
            "sum_bash": "tried to run commands {n}x",
            "sum_web": "opened the web {n}x",
            "sum_other": "other tools {n}x",
            "sessions_header": "Sessions in this working folder, newest first:",
            "session_row": "{n}. {id} ({age})",
            "session_row_titled": "{n}. {title} · {id} ({age})",
            "sessions_none": "No sessions in this working folder yet.",
            "sessions_use": "Type /claude continue 1 (or another number) to continue it from here.",
            "session_adopted": "Done, the next /claude continues session {id}.",
            "session_not_found": "That session number doesn't exist. Type /claude session to see the list.",
            "session_active": "That session was just used and may still be open in another window. Wait a minute or close it first, then try again.",
            "interrupted": "Interrupted because Aemeath was closed while the request was running.",
            "age_now": "just now",
            "age_minutes": "{n} min ago",
            "age_hours": "{n} h ago",
            "age_days": "{n} d ago"
        },
        "settings": {
            "title": "Aemeath Settings",
            "os_badge": "System environment: {os}",
            "tabs": {
                "general": "General",
                "chatbot": "Chatbot",
                "commands": "Commands",
                "memory": "Memory",
                "appearance": "Appearance"
            },
            "language": {
                "title": "Language",
                "label": "Interface & assistant language",
                "hint": "Select language for Aemeath's interface and assistant responses.",
                "id": "Bahasa Indonesia",
                "en": "English"
            },
            "interactive": {
                "title": "Interactive mode",
                "low_title": "Low",
                "low_desc": "Aemeath chats and talks with you normally.",
                "medium_title": "Medium",
                "medium_desc": "Aemeath can observe active applications (browsing, gaming, etc.) and warn you when doomscrolling too long.",
                "full_title": "Full",
                "full_badge": "New",
                "full_desc": "More intensive than Medium: Aemeath detects open programs, social media, programming languages & test files while coding, window switching, and evaluates your work (/review) without screen capture.",
                "medium_consent_title": "Before enabling Medium, here is what happens:",
                "medium_consent_1": "Every few seconds Aemeath reads the active application name and window title.",
                "medium_consent_2": "Titles are discarded immediately after categorizing activity. Only category and app/game names are kept, and only in memory.",
                "medium_consent_3": "Nothing is saved to disk or sent to the internet, including to the chatbot.",
                "medium_consent_4": "Private windows (incognito, InPrivate), password managers, and lock screens are never read.",
                "medium_consent_5": "You can return to Low at any time, and reading stops immediately.",
                "medium_accept": "Enable Medium",
                "medium_cancel": "Cancel",
                "full_consent_title": "Before enabling Full, here is what happens:",
                "full_consent_1": "Includes all Medium tracking, plus programming language and test file detection while coding, and reminders if you switch windows too frequently.",
                "full_consent_2": "Never captures or records the screen (lightweight on CPU/RAM).",
                "full_consent_3": "Private windows, password managers, lock screen, and UAC prompts are always skipped and never read.",
                "full_consent_4": "The /review command checks git diff status 100% locally on this computer and detects potential API key or .env leaks. No activity or code data is ever sent to the internet.",
                "full_accept": "Enable Full",
                "full_cancel": "Cancel",
                "doom_label": "Remind when scrolling social media",
                "doom_unit": "{minutes} minutes"
            },
            "startup": {
                "title": "Startup",
                "toggle": "Launch Aemeath automatically on startup",
                "hint": "Enabled by default, so Aemeath appears every time you turn on your computer. Disable here to remove the startup entry."
            },
            "github": {
                "title": "GitHub (read-only)",
                "toggle": "Enable the /github command",
                "repo_label": "Repository (owner/name)",
                "saved": "Saved.",
                "invalid": "It must look like owner/name, so it was not saved.",
                "hint": "Off by default. Aemeath reads builds, open pull requests, and open issues of one repository through your own GitHub CLI (gh). Only the repository name and your gh login are sent; Aemeath stores no token and writes nothing to GitHub. Results are only displayed."
            },
            "agent": {
                "title": "AI agent bridge",
                "toggle": "Enable the /claude command (Claude Code)",
                "dir_label": "Claude working folder",
                "dir_none": "Home folder",
                "dir_pick": "Choose folder...",
                "dir_clear": "Use home folder",
                "purge_button": "Delete module data...",
                "purge_hint": "Deletes the task records and the working folder choice, then turns this module off. Chat history, persona, language, and memory are not touched. Your own Claude Code sessions are not deleted either.",
                "purge_confirm": "Delete the AI agent module data? A running request is stopped, the task records and working folder choice are deleted, and the module is turned off. Chat history, persona, and language stay safe. This cannot be undone.",
                "purge_done": "The AI agent module data was deleted and the module is off.",
                "tasks_title": "Recent agent tasks",
                "tasks_refresh": "Refresh",
                "tasks_stop": "Stop the running one",
                "tasks_none": "No tasks yet.",
                "tasks_seconds": "{n} s",
                "tasks_attempt": "attempt {n}",
                "status_pending": "Pending",
                "status_planning": "Planning",
                "status_awaiting_approval": "Awaiting approval",
                "status_running": "Running",
                "status_succeeded": "Succeeded",
                "status_failed": "Failed",
                "status_cancelled": "Cancelled",
                "hint": "Off by default. Aemeath runs Claude Code on this computer for messages you type yourself, for reading and answering. Files are edited only after you type /claude ya, and running commands is always denied. Your message goes to Claude's service through your own Claude Code login. Aemeath does not include your activity data. Claude can read the contents of the working folder you choose, so pick a project folder, not one with personal data."
            },
            "movement": {
                "title": "Movement & display",
                "stay_still": "Stay still (do not walk or fly)",
                "transparent": "Click-through transparent mode",
                "transparent_hint": "Mouse clicks pass through Aemeath to windows behind. Useful if you accidentally click her over buttons. Use tray menu to toggle off.",
                "opacity": "Pet opacity",
                "opacity_label": "Sprite opacity in transparent mode",
                "opacity_min": "faint (15%)",
                "opacity_max": "solid (100%)",
                "stay_still_hint": "Aemeath stops flying around and stays in her current position. You can still drag her elsewhere, and she still chats and reacts. Can also be toggled from tray menu."
            },
            "chatter": {
                "title": "Chatter",
                "toggle": "Allow Aemeath to chatter occasionally",
                "interval": "Average chatter interval",
                "interval_unit": "{minutes} minutes",
                "proactive_pause": "Temporarily pause all proactive chatter",
                "max_per_hour": "Maximum remarks per hour",
                "cooldown": "Same category cooldown",
                "cooldown_unit": "{minutes} minutes",
                "quiet_hours": "Quiet hours (no spontaneous chatter)",
                "quiet_hours_start": "Start",
                "quiet_hours_end": "End",
                "toggle_label": "Allow Aemeath to chat with you",
                "interval_label": "Interval between remarks",
                "frequent": "frequent",
                "rare": "rare"
            },
            "chatbot": {
                "title": "Chatbot & Model",
                "provider": "Model provider",
                "model": "Model selection",
                "streaming": "Display response word by word (streaming)",
                "web_search": "Allow web search when necessary",
                "offline_fallback": "Use local answers if internet or API key is unavailable",
                "shortcut": "Chat open shortcut",
                "api_key": "API Key",
                "api_key_placeholder": "Enter API key...",
                "save_key": "Save key",
                "clear_key": "Clear key",
                "key_saved": "API key securely saved.",
                "key_cleared": "API key cleared.",
                "provider_label": "Provider",
                "model_label": "Model",
                "web_search_label": "Search the web for more accurate answers",
                "web_search_hint": "Uses Wuthering Waves Wiki for game questions and Wikipedia for other topics. Search keywords are sent to those sites, and results are referenced with sources. Not a general search engine.",
                "offline_label": "Chat offline without API key or internet",
                "offline_hint": "When no API key or disconnected, Aemeath answers from local lorebook notes. If unknown, she advises checking online or setting an API key.",
                "streaming_label": "Text streaming mode (word-by-word response)",
                "streaming_hint": "Displays real-time typing output (streaming) while AI generates answers. Turn off if you prefer the full response at once.",
                "key_label": "API Key",
                "key_placeholder": "Paste key here",
                "key_save": "Save key",
                "key_clear": "Clear key",
                "key_hint_1": "Keys are only stored locally on this machine, encrypted via system credential storage outside the project directory. Keys are never sent to repos, other windows, or anyone other than the provider.",
                "key_hint_2": "Messages typed in chat are sent to the provider for generation. Conversation history lives only in memory and is discarded minutes after closing chat."
            },
            "commands": {
                "title": "Custom commands",
                "hint": "Create custom command shortcuts to launch applications, URLs, or run scripts.",
                "add": "Add command",
                "table_name": "Name",
                "table_type": "Type",
                "table_target": "Target / Script",
                "table_actions": "Actions",
                "builtin_title": "Built-in commands",
                "builtin_hint": "These commands are built into Aemeath. Their names are reserved, so custom commands cannot shadow them.",
                "builtin_focus": "Focused work sessions (for example /focus 25m Task, /focus status).",
                "builtin_quest": "Manage up to 3 daily priorities (/quest add ..., alias /daily).",
                "builtin_chronicle": "Optional daily summary from local facts (/chronicle aktif).",
                "builtin_memory": "Manage the companion's memory notes (/memory, /memory hapus 1).",
                "builtin_feature": "Open the Aemeath Guidebook, the feature guide.",
                "builtin_claude": "Ask Claude Code from the chat box. Off by default, turn it on in the General tab (/claude stop, /claude sesi).",
                "builtin_jadwal": "Local recurring reminders (for example /jadwal tambah 08:30 harian Minum obat).",
                "builtin_claude_mode": "Turn Aemeath into a Claude agent: everything you type goes to Claude (/claude-mode again to leave).",
                "terminal_toggle": "Allow terminal mode",
                "terminal_hint": "When /change-mode is invoked, Windows requests UAC elevation first. Once approved, the chat box becomes a PowerShell session running as your user (not admin), and only commands you type are executed. The chatbot does not participate, and the session ends upon closing the box, typing exit, or after 15 minutes of inactivity.",
                "custom_title": "Custom commands",
                "custom_intro_hint": "Type /name in chat to launch apps, folders, URLs, or PowerShell scripts (e.g. /invoice for documents, /wuwa for game launcher, or /matikan to shutdown). Type / alone to list commands. Executed 100% locally: never sent to the chatbot.",
                "add_btn": "Add command",
                "preset_label": "Or start from examples",
                "preset_btn": "Add example",
                "target_hint": "Target can be a full path to an application, file, or folder (supports %USERPROFILE%), or http:// / https:// URLs. Arguments only apply to .exe programs.",
                "shell_hint": "PowerShell commands run as your current user (non-admin), single line, with 30s timeout. Dangerous commands (shutdown, format, delete, download-and-execute) always require confirmation. /matikan includes a 60s countdown cancellable with /batal."
            },
            "memory": {
                "title": "Companion memory",
                "description": "Things Aemeath is allowed to remember while chatting with you.",
                "clear_all": "Clear all memory",
                "empty": "No saved memory notes yet.",
                "hint": "Things you permit Aemeath to remember: current projects, pending tasks, design choices, and conversational preferences. Kept separate from the lorebook: game facts remain canon-sourced.",
                "toggle": "Allow Aemeath to remember things",
                "toggle_hint": "When disabled, nothing new is saved and no memories are attached to model prompts. Existing memories can be reviewed and deleted below.",
                "retention_label": "AI summaries are cleaned up after",
                "retention_hint": "Only summaries created automatically by Aemeath follow this rule. Memories you manually add are never deleted automatically.",
                "new_placeholder": "For example: working on bilingual localization in aemeath-ai-agent.",
                "kind_project": "Project",
                "kind_task": "Task",
                "kind_decision": "Decision",
                "kind_preference": "Preference",
                "kind_next_step": "Next step",
                "kind_context": "Context",
                "save_btn": "Save",
                "cancel_btn": "Cancel",
                "add_btn": "Add memory",
                "clear_btn": "Clear all",
                "privacy_hint": "Only relevant memories — at most 4 snippets — are attached to prompts when you send a message. All entries are stored locally in memory.json and can be deleted at any time."
            },
            "appearance": {
                "title": "Appearance & Theme",
                "hint": "Pick a built-in theme or adjust color, frosted blur, and glass transparency live. Changes apply instantly to every window (companion, chat, settings, and guidebook).",
                "theme_label": "Theme selection",
                "preset_label": "Glass preset",
                "blur_label": "Frosted Blur (Blur px)",
                "opacity_label": "Glass opacity",
                "hue_label": "Color Hue (Hue 0° - 360°)",
                "preview_title": "Live Glass Preview",
                "preview_card_title": "Aemeath Companion",
                "preview_sample_btn": "Test Button",
                "contrast_optimal": "Optimal contrast quality: WCAG AA passed.",
                "contrast_autofix": "Auto-fix",
                "base_mode": "Base Mode",
                "dark": "Dark",
                "dark_desc": "Nighttime translucent glass.",
                "light": "Light",
                "light_desc": "Soft glowing white glass.",
                "system": "System",
                "system_desc": "Follows Windows / OS theme.",
                "reduce_effects": "Reduce visual effects (no blur, solid opacity, minimal animations)",
                "presets_title": "Built-in Themes (Presets)",
                "reset_preset": "Reset to Preset",
                "preset_hint": "Adjusting sliders automatically changes theme to Custom. Double-click any slider to reset to default.",
                "color_title": "Accent Color Settings (OKLCH Space)",
                "chroma_label": "Color Intensity (Chroma)",
                "lightness_label": "Color Brightness (Lightness)",
                "frosted_title": "Frosted Glass & Transparency Settings",
                "glass_opacity": "Glass Transparency (Opacity %)",
                "radius_label": "Rounded Corners (Radius px)",
                "border_label": "Border Strength (Border %)",
                "typography_title": "Typography",
                "scale_label": "Text Size Scale (%)",
                "export_btn": "Export Theme (JSON)",
                "import_btn": "Import Theme...",
                "export_hint": "Exported theme files are secure JSON and can be shared or re-imported anytime."
            },
            "os_detected": "System environment detected: {os} (shell: {shell})",
            "shortcut_section": {
                "title": "Keyboard shortcut",
                "label": "Open or close chat box from anywhere",
                "hint": "Press this shortcut anytime to quickly type messages or run /name commands without clicking Aemeath."
            },
            "proactive": {
                "title": "Proactive interactions",
                "pause": "Pause all proactive interactions",
                "pause_hint": "When enabled, Aemeath stops greeting and commenting on her own. Scheduled reminders via /timer and critical AI session alerts still appear. Same toggle is in the tray menu.",
                "cap_label": "Maximum proactive reactions per hour",
                "cooldown_label": "Cooldown after same reaction type",
                "cooldown_hint": "Applies to activity reactions, not spontaneous chatter intervals. Higher priorities win: AI decisions, failures, direct requests, timers, activity, then chatter. Chatter is held while typing in chat, idle, or during focus timers.",
                "ladder_label": "Notification priority order (1 = highest, 6 = lowest)",
                "prio_decision": "AI session decision",
                "prio_failure": "AI session failure / aborted",
                "prio_direct": "Direct request & memory",
                "prio_productivity": "Timer & finished session",
                "prio_activity": "Activity & memory offer",
                "prio_chatter": "Casual chat & trivia",
                "prio_hint": "Adjust priority when multiple messages arrive simultaneously.",
                "dnd_toggle": "Enable quiet hours (Do Not Disturb)",
                "dnd_start": "Start",
                "dnd_end": "Until",
                "dnd_hint": "During quiet hours, Aemeath will not greet or chatter casually. Critical alerts (like AI decisions and timers) will still be delivered."
            },
            "lorebook": {
                "title": "Lorebook & Wuthering Waves Wiki Data",
                "hint": "Aemeath chats about Wuthering Waves facts from the local lorebook. You can update data from the Wuthering Waves Wiki anytime (leave blank for core pages like Solaris-3, Lore, and Resonator, or specify a page title/URL).",
                "placeholder": "Example: Solaris-3, Lore, Rinascita (optional)",
                "update_btn": "Update Wiki"
            }
        },
        "chat": {
            "folder_button_title": "Claude working folder",
            "folder_home": "Home folder",
            "folder_pick": "Choose another folder...",
            "folder_busy": "Wait for the /claude request to finish first.",
            "folder_changed": "Claude now works in {name}. The Claude conversation starts over.",
            "folder_error": "That folder can't be used.",
            "agent_pending": "Aemeath is reaching out to Claude...",
            "claude_mode_badge": "Claude",
            "claude_placeholder": "Write a task for Claude...",
            "claude_mode_off": "Left Claude mode. We are chatting normally again~",
            "claude_mode_already": "Claude mode is already on.",
            "claude_mode_not_on": "Claude mode is not on.",
            "claude_mode_ended": "The Claude module was turned off, so Claude mode ended.",
            "claude_mode_terminal": "Leave terminal mode first (type exit), then turn on Claude mode.",
            "session_button_title": "Claude session",
            "session_label": "Session {id}",
            "session_none": "New session",
            "session_new": "Start a new session",
            "session_new_done": "A new Claude session started. The next message opens a new conversation.",
            "session_changed": "Claude continues session {id}.",
            "placeholder": "Type a message for Aemeath...",
            "send": "Send",
            "retry": "Retry",
            "reset": "Reset chat",
            "settings": "Settings",
            "empty": "Type a message to start chatting with Aemeath.",
            "thinking": "Aemeath is thinking...",
            "searching": "Aemeath is searching the web...",
            "local_badge": "Local",
            "search_sources": "Sources:",
            "attach_image": "Attach image",
            "remove_image": "Remove image",
            "uploading": "Uploading...",
            "unsupported_format": "Image format not supported.",
            "offline_notice": "Offline mode: using local lore notes.",
            "companion_mode": "Companion Mode Active",
            "wiki_mode": "Wuthering Waves Wiki Mode",
            "greeting": "Hi, Rover! What would you like to chat about? You can ask about Wuthering Waves too~"
        },
        "feature_guide": {
            "title": "Aemeath Guidebook",
            "search_placeholder": "Search features, commands, or tips...",
            "no_results": "No matching results found.",
            "dialogue_default": "Rover~! I'm here accompanying you through the guidebook.",
            "category_all": "All",
            "header_sub": "Official Feature Guide & /feature Command Reference",
            "mode_pill": "Local & Offline",
            "theme_toggle_title": "Toggle Theme (Default / Glassmorphism)",
            "close_title": "Close Guidebook (Esc)",
            "search_clear": "Clear search",
            "nav_header": "Module List",
            "nav_count": "{count} Topics",
            "sidebar_footer": "Type /feature anytime",
            "avatar_title": "Click Aemeath for a bouncy greeting!",
            "companion_hint": "Click to greet",
            "footer_left": "Commands /help and /bantuan remain active and unchanged.",
            "footer_right": "Use Tab or Enter keys to navigate",
            "purpose_title": "Main Purpose / Function",
            "usage_title": "Usage & Syntax",
            "copy": "Copy",
            "copied": "Copied!",
            "examples_label": "Example Inputs:",
            "requirements_title": "Requirements",
            "mode_title": "Mode Availability",
            "privacy_title": "Privacy & Security Guaranteed",
            "reset_btn": "Reset",
            "breadcrumb_prefix": "Aemeath Guidebook > "
        },
        "errors": {
            "network": "Network connection lost. Checking again...",
            "timeout": "Request timed out. Please try asking again.",
            "busy": "Aemeath is still thinking about the previous message.",
            "empty_input": "Please write something first, Rover.",
            "empty_search": "Please write search keywords after /search, Rover.",
            "too_long": "Message is too long (maximum {max} characters).",
            "no_key": "No API key for {provider} yet. Set it in Settings.",
            "provider_unknown": "Unknown chatbot provider.",
            "unsupported_vision": "Provider {provider} ({model}) does not support image input.",
            "search_failed": "Sorry Rover, web search failed due to network issues or timeout. I won't guess without sources—please try again shortly.",
            "search_empty": "I searched the web, but couldn't find valid sources for \"{query}\", Rover. I won't invent answers without proof—please try more specific keywords.",
            "search_secret": "Sorry Rover, web search cannot be performed for this message.",
            "unknown": "An error occurred."
        }
    },
  };

  function normalizeLocale(loc) {
    if (typeof loc === 'string' && SUPPORTED_LOCALES.includes(loc)) {
      return loc;
    }
    return DEFAULT_LOCALE;
  }

  function getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && Object.prototype.hasOwnProperty.call(curr, part)) {
        curr = curr[part];
      } else {
        return undefined;
      }
    }
    return typeof curr === 'string' ? curr : undefined;
  }

  function interpolate(template, params) {
    if (!params || typeof params !== 'object') return template;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
      if (Object.prototype.hasOwnProperty.call(params, token)) {
        return String(params[token]);
      }
      return '{' + token + '}';
    });
  }

  function extractTokens(template) {
    const tokens = [];
    const regex = /\{([a-zA-Z0-9_]+)\}/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      tokens.push(match[1]);
    }
    return tokens.sort();
  }

  function createI18n(options) {
    const opts = options || {};
    let currentLocale = normalizeLocale(opts.locale);
    const catalogs = Object.assign({}, defaultCatalogs || {}, opts.catalogs || {});

    function t(key, params) {
      if (typeof key !== 'string') return '';
      const activeCatalog = catalogs[currentLocale];
      let val = getNestedValue(activeCatalog, key);

      // Fallback to default locale if missing in active catalog
      if (typeof val !== 'string' && currentLocale !== DEFAULT_LOCALE) {
        val = getNestedValue(catalogs[DEFAULT_LOCALE], key);
      }

      if (typeof val !== 'string') {
        return key;
      }

      return interpolate(val, params);
    }

    function setLocale(loc) {
      currentLocale = normalizeLocale(loc);
      return currentLocale;
    }

    function getLocale() {
      return currentLocale;
    }

    function getCatalog(loc) {
      const normalized = normalizeLocale(loc || currentLocale);
      return catalogs[normalized] || {};
    }

    function applyDom(container) {
      const root = container || (typeof document !== 'undefined' ? document : null);
      if (!root || typeof root.querySelectorAll !== 'function') return;

      const elements = root.querySelectorAll('[data-i18n]');
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const key = el.getAttribute('data-i18n');
        if (key) {
          el.textContent = t(key);
        }
      }

      const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
      for (let i = 0; i < placeholders.length; i++) {
        const el = placeholders[i];
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
          el.placeholder = t(key);
        }
      }

      const titles = root.querySelectorAll('[data-i18n-title]');
      for (let i = 0; i < titles.length; i++) {
        const el = titles[i];
        const key = el.getAttribute('data-i18n-title');
        if (key) {
          el.title = t(key);
        }
      }

      const arias = root.querySelectorAll('[data-i18n-aria]');
      for (let i = 0; i < arias.length; i++) {
        const el = arias[i];
        const key = el.getAttribute('data-i18n-aria');
        if (key) {
          el.setAttribute('aria-label', t(key));
        }
      }
    }

    return {
      t: t,
      setLocale: setLocale,
      getLocale: getLocale,
      getCatalog: getCatalog,
      applyDom: applyDom,
      SUPPORTED_LOCALES: SUPPORTED_LOCALES,
      DEFAULT_LOCALE: DEFAULT_LOCALE,
    };
  }

  function validateCatalogParity(catA, catB, prefix) {
    const pfx = prefix ? prefix + '.' : '';
    const missingInB = [];
    const missingInA = [];
    const tokenMismatches = [];

    const keysA = Object.keys(catA || {});
    const keysB = Object.keys(catB || {});

    for (const k of keysA) {
      if (k === 'locale') continue;
      const fullKey = pfx + k;
      if (!(k in catB)) {
        missingInB.push(fullKey);
      } else if (typeof catA[k] === 'object' && catA[k] !== null) {
        if (typeof catB[k] !== 'object' || catB[k] === null) {
          missingInB.push(fullKey);
        } else {
          const sub = validateCatalogParity(catA[k], catB[k], fullKey);
          missingInB.push(...sub.missingInB);
          missingInA.push(...sub.missingInA);
          tokenMismatches.push(...sub.tokenMismatches);
        }
      } else if (typeof catA[k] === 'string') {
        if (typeof catB[k] !== 'string') {
          missingInB.push(fullKey);
        } else {
          const tokensA = extractTokens(catA[k]);
          const tokensB = extractTokens(catB[k]);
          if (JSON.stringify(tokensA) !== JSON.stringify(tokensB)) {
            tokenMismatches.push({
              key: fullKey,
              tokensA: tokensA,
              tokensB: tokensB,
            });
          }
        }
      }
    }

    for (const k of keysB) {
      if (k === 'locale') continue;
      const fullKey = pfx + k;
      if (!(k in catA)) {
        missingInA.push(fullKey);
      }
    }

    return {
      missingInB: missingInB,
      missingInA: missingInA,
      tokenMismatches: tokenMismatches,
      isParity: missingInA.length === 0 && missingInB.length === 0 && tokenMismatches.length === 0,
    };
  }

  return {
    SUPPORTED_LOCALES: SUPPORTED_LOCALES,
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    normalizeLocale: normalizeLocale,
    createI18n: createI18n,
    validateCatalogParity: validateCatalogParity,
    defaultCatalogs: defaultCatalogs,
  };
});
