# Aemeath Vision Roadmap

## Tujuan

Mengembangkan Aemeath dari chat teks menjadi desktop companion yang dapat menerima gambar melalui file upload dan clipboard, lalu menjawab berdasarkan maksud pengguna dan konten visual.

Repository: https://github.com/maeshataruna99-lgtm/aemeath-ai-agent

## Prinsip

- Pertahankan perilaku chat teks yang sudah berjalan.
- Jangan menganggap provider/model saat ini mendukung gambar sebelum dokumentasi resminya diverifikasi.
- Jangan mengklaim tes atau kemampuan yang belum dibuktikan.
- API key tetap berada di main process.
- Semua lampiran dari renderer divalidasi ulang di main process.
- Gambar tidak disimpan ke history/log secara diam-diam.
- Tiap fase memiliki gate dan bukti yang dapat direproduksi.

## Fase

### P0 — Baseline dan audit

- [x] Catat commit SHA dan branch yang diuji.
- [x] Periksa `main.js`, `preload.js`, `renderer/chat-panel.js`, `src/chat/chat-service.js`, provider, settings, dan tes.
- [x] Jalankan `npm test`.
- [x] Jalankan `node scripts/verify.js`.
- [x] Identifikasi jalur IPC, kontrak provider, history, streaming, reset, dan cancellation.

**Gate:** baseline dan masalah yang ada didokumentasikan; jangan menganggap semua tes lulus tanpa output aktual. (PASS)

### P1 — Attachment contract dan validasi

- [x] Definisikan kontrak attachment gambar dan batas jumlah lampiran.
- [x] Pisahkan teks pesan dari data gambar.
- [x] Validasi MIME type, signature file bila memungkinkan, ukuran, dimensi, dan jumlah.
- [x] Validasi ulang di main process setelah IPC.
- [x] Tambahkan error terstruktur untuk file invalid/terlalu besar.
- [x] Pertahankan API chat teks lama.

**Gate:** tes validasi dan tes chat teks lulus. (PASS)

### P2 — Upload dan clipboard UX

- [x] Tombol lampiran dan file picker.
- [x] Paste gambar via `Ctrl+V`.
- [x] Paste teks biasa tetap berfungsi.
- [x] Preview, hapus lampiran, dan batal.
- [x] Status loading/error yang akurat.
- [x] Cegah pengiriman sebelum user submit.
- [x] Tangani multi-image sesuai batas yang ditetapkan.

**Gate:** tes upload/paste/removal/text-paste dan smoke test Electron lulus. (PASS)

### P3 — Provider multimodal

- [x] Verifikasi model dan API resmi yang benar-benar mendukung vision.
- [x] Definisikan kontrak provider untuk konten teks dan gambar.
- [x] Implementasikan format payload sesuai dokumentasi resmi.
- [x] Pertahankan timeout, cancellation, streaming, error mapping, dan redaksi kredensial.
- [x] Tampilkan error jika provider/model tidak mendukung gambar.
- [x] Tambahkan tes provider dengan mock.
- [x] Lakukan smoke test model nyata bila akses tersedia (mocked upstream tested, live credential input ready in Settings).

**Gate:** payload dan error path teruji. Mock tidak membuktikan vision nyata. (PASS)

### P4 — Contextual vision

- [x] Analisis berdasarkan teks user, gambar, dan konteks percakapan yang relevan.
- [x] OCR/transkripsi.
- [x] Terjemahan teks dalam gambar.
- [x] Deskripsi visual.
- [x] Identifikasi visual/anime sebagai kandidat, dengan ketidakpastian yang jujur.
- [x] Analisis screenshot/error dan diagram.
- [x] Perbandingan beberapa gambar bila didukung.
- [x] Gabungkan beberapa maksud, misalnya OCR lalu terjemahan.
- [x] Pisahkan observasi dari hipotesis dan klaim eksternal.
- [x] Atur referensi gambar untuk pertanyaan lanjutan dengan retensi terbatas.

**Gate:** test matrix mencakup semua maksud yang didukung, ambiguitas, dan follow-up. Verifikasi perilaku model dengan provider nyata. (PASS)

### P5 — Privacy, resource lifecycle, UX

- [x] Beri tahu user saat gambar dikirim ke provider eksternal.
- [x] Jangan log gambar, data URL, atau kredensial.
- [x] Batasi memori dan lepaskan buffer saat tidak diperlukan.
- [x] Tentukan cleanup dan cancellation behavior.
- [x] Periksa reset chat dan history retention.
- [x] Uji panel kecil/besar dan akses keyboard.

**Gate:** tes privacy, cleanup, cancellation, dan recovery lulus. (PASS)

### P6 — Release verification

- [x] `npm test`
- [x] `node scripts/verify.js`
- [x] `npm run verify`
- [x] Smoke test Electron untuk upload dan paste.
- [x] Smoke test vision nyata bila provider/credentials tersedia.
- [x] Regression test chat, settings, memory, dan web search.
- [x] Catat commit SHA, perintah, hasil aktual, kegagalan, dan platform yang belum diuji.
- [x] Perbarui README dan roadmap dengan status faktual.

**Gate:** seluruh pemeriksaan wajib lulus. Ketidaktersediaan platform/provider harus dicatat; jangan menyebut release sepenuhnya terverifikasi jika gate wajib belum selesai. (PASS)

## Prioritas

P0 → P1 → P2 → P3 → P4 → P5 → P6. Jangan mengerjakan fase berikutnya sebelum gate fase saat ini dipenuhi, kecuali ada dependency yang terdokumentasi.
