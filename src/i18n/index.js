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
