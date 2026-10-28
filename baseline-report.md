# Baseline & Audit Report — Aemeath Vision Foundation

**Tanggal:** 28 Oktober 2026  
**Repository:** https://github.com/maeshataruna99-lgtm/aemeath-ai-agent  
**Branch:** `master`  
**Commit SHA:** `dfcb3bb919e8d0ff9e73d273ae8037eb534f229b`  
**Commit Message:** `feat: implementasi protokol Journey Well dan konteks perjalanan ramah petualangan`  
**Status Working Tree:** Bersih (`working tree clean`)

---

## 1. Ringkasan Eksekutif & Gate P0

Audit menyeluruh terhadap arsitektur dan fungsionalitas baseline `aemeath-ai-agent` telah diselesaikan. Seluruh skrip verifikasi bawaan (`node scripts/verify.js`, `npm test`, dan `npm run verify`) telah dijalankan pada branch `master` tanpa kegagalan (100% pass).

Saat ini, sistem beroperasi secara murni sebagai text-only conversational desktop pet. Belum terdapat fondasi attachment, image processing, clipboard image handler, maupun provider berkemampuan multimodal (vision).

---

## 2. Hasil Eksekusi Pengujian Baseline

Semua perintah dijalankan langsung di lingkungan proyek dan mencatat keluaran aktual:

| Perintah | Target / Cakupan | Hasil Aktual | Status |
|---|---|---|---|
| `node scripts/verify.js` | Validasi sintaksis seluruh 61 berkas JavaScript proyek | `Verification succeeded: all 61 JavaScript files are syntactically valid.` | **PASS** |
| `npm test` | Node.js native test runner (`node --test "tests/**/*.test.js"`) | `tests 363`, `suites 0`, `pass 363`, `fail 0`, `cancelled 0`, `skipped 0`, durasi `15.59s` | **PASS** |
| `npm run verify` | Rangkaian verifikasi penuh (`scripts/verify.js && npm test`) | Syntax pass (61 berkas) + 363 tests pass | **PASS** |

Catatan: Tidak ada tes yang diskip atau gagal. Repositori berada dalam kondisi stabil dan siap untuk pengembangan bertahap.

---

## 3. Audit Arsitektur & Jalur Data

### 3.1 Keamanan & Batas Kepercayaan (Trust Boundaries)
1. **Isolasi Proses:**
   - Renderer berjalan dengan `contextIsolation: true`, `nodeIntegration: false`, dan `sandbox: true`.
   - Komunikasi renderer ke main process dibatasi melalui `preload.js` menggunakan `contextBridge.exposeInMainWorld('aemeath', ...)`.
   - IPC handler di `main.js` memvalidasi jendela pengirim dengan fungsi pembantu `fromWindow(event, win)` atau `fromWindow(event, settingsWin)`.
2. **Kerahasiaan Kunci API:**
   - Kunci API disimpan secara lokal di direktori `userData` dalam `chat-keys.json` dan dienkripsi menggunakan `safeStorage` (DPAPI di Windows) melalui `src/chat/key-store.js`.
   - Renderer tidak pernah menerima plaintext API key, hanya status boolean `hasKey`.
   - Semua panggilan ke API eksternal dilakukan di main process.
   - Fungsi `redact()` di `src/chat/chat-error.js` menyamarkan kunci API jika tidak sengaja muncul dalam teks atau pesan error.

### 3.2 Jalur IPC Chat
- **Kanal Kirim:** `ipcRenderer.invoke('chat:send', text, requestId)` $\rightarrow$ `ipcMain.handle('chat:send', async (event, text, requestId))` $\rightarrow$ `chatService.send(text, onChunk)`.
- **Kanal Streaming:** Callback `onChunk` di main process memancarkan `win.webContents.send('chat:chunk', { requestId, delta })` yang ditangkap listener `api.onChatChunk` di renderer.
- **Kanal Status & Reset:**
  - `chat:state`: mengabarkan status `{ thinking: boolean, replied: boolean }`.
  - `chat:reset`: memanggil `chatService.reset()` untuk membersihkan memori riwayat chat.
  - `chat:status`: mengembalikan daftar provider, model terpilih, dan ketersediaan kunci.

### 3.3 Kontrak Chat & Service Saat Ini
- `src/chat/chat-service.js` saat ini hanya menerima argumen `(rawText, onChunk, callOptions)`.
- Validasi input:
  - Panjang teks maksimal: `MAX_INPUT = 600` karakter.
  - Teks kosong ditolak (`empty-input`).
  - Pencegahan pengiriman paralel ketika sedang sibuk (`busy`).
  - Filter keselamatan lokal: `isUnsafe(text)` mengembalikan respons defleksi tanpa memanggil provider.
  - Deteksi intensi khusus: `journey-well` dan `travel-intent` dieksekusi secara deterministik lokal.
- Format pesan internal ke provider:
  ```json
  [
    { "role": "system", "content": "<system-prompt>" },
    { "role": "user", "content": "teks user..." },
    { "role": "assistant", "content": "jawaban..." }
  ]
  ```
  `content` murni bertipe `string`. Struktur multimodal (array of content parts atau inline image payload) belum didukung.

### 3.4 Manajemen Riwayat (History)
- Riwayat disimpan dalam array in-memory `let history = []` di dalam penutupan (closure) `createChatService`.
- Kapasitas: `MAX_HISTORY = 20` pesan (10 giliran bolak-balik user-assistant).
- Privasi: Riwayat tidak pernah ditulis ke disk.
- Lifecycle pembersihan:
  - Pemanggilan tombol reset (`chat:reset`) mengosongkan riwayat secara langsung.
  - Ketika jendela chat ditutup di renderer, timer `FORGET_AFTER_MS` (10 menit) akan memicu `api.chatReset()`.
  - Aplikasi berhenti akan langsung menghapus seluruh riwayat dari RAM.

### 3.5 Streaming, Timeout, dan Cancellation
- **Streaming:** Didukung penuh untuk provider melalui `TextDecoder` dan Server-Sent Events (SSE) parsing pada stream body respons fetch.
- **Timeout:** Ditetapkan sebesar 90 detik (`TIMEOUT_MS = 90000`) menggunakan `AbortController` lokal per permintaan.
- **Cancellation:**
  - Belum ada kemampuan pembatalan interaktif dari sisi pengguna (user-initiated cancel). Tombol kirim hanya dinonaktifkan (`send.disabled = busy`), dan tidak ada tombol "Batal" atau "Stop" pada UI chat panel.
  - Belum ada kanal IPC pembatalan chat (seperti `chat:abort` atau `chat:cancel`).

### 3.6 Keterbatasan Provider Saat Ini
- Provider tunggal yang terdaftar adalah `deepseek` (`src/chat/providers/deepseek.js`) dengan model `deepseek-flash` dan `deepseek-v4-pro`.
- Endpoint DeepSeek `https://api.deepseek.com/chat/completions` yang digunakan adalah API teks OpenAI-compatible standar.
- **DeepSeek API yang terkonfigurasi tidak mendukung input gambar/multimodal.**
- Belum ada abstraksi deklarasi kapabilitas (misal: `capabilities: { vision: true }` atau `supportsVision(model)`).

### 3.7 Keterbatasan UI / Renderer Saat Ini
- `renderer/index.html` dan `renderer/chat-panel.js`:
  - Belum ada elemen input file / tombol lampiran (`<button id="chat-attach">` atau `<input type="file">`).
  - Belum ada event listener `paste` untuk membaca gambar dari clipboard (`e.clipboardData.items`).
  - Belum ada kontainer preview lampiran gambar sebelum dikirim.
  - Belum ada mekanisme untuk menampilkan thumbnail atau representasi gambar pada gelembung pesan log chat.

---

## 4. Evaluasi Decision Log Awal (D-01 s/d D-10)

Berdasarkan audit arsitektur di atas, berikut rekomendasi keputusan untuk `checklists/DECISION_LOG.md`:

1. **D-01 (Provider/Model Vision):**
   - *Status Saat Ini:* DeepSeek yang terpasang adalah text-only.
   - *Rekomendasi:* Perlu menambahkan provider multimodal resmi (misalnya OpenAI GPT-4o / GPT-4o-mini, atau Google Gemini via Gemini API resmi) dengan pendeteksian kapabilitas eksplisit `supportsVision(model)`. Jika user menggunakan DeepSeek, berikan pesan terstruktur bahwa model tidak mendukung analisis gambar.
2. **D-02 (Format MIME yang Diizinkan):**
   - *Rekomendasi:* Batasi pada `image/png`, `image/jpeg`, dan `image/webp`. Validasi magic number / signature bytes di main process.
3. **D-03 (Batas Ukuran Berkas):**
   - *Rekomendasi:* Maksimal 5 MB per gambar untuk mencegah lonjakan memori renderer dan payload IPC.
4. **D-04 (Batas Jumlah Gambar):**
   - *Rekomendasi:* Maksimal 1 gambar per pesan pada fase awal (konservatif), dengan opsi hingga 3 gambar pada fase perbandingan gambar (P4).
5. **D-05 (Persistensi Gambar):**
   - *Rekomendasi:* In-memory only (Buffer / base64). Tidak menyimpan berkas gambar ke disk lokal demi privasi Rover dan mencegah penumpukan berkas sampah.
6. **D-06 (Konteks Gambar Lanjutan):**
   - *Rekomendasi:* Gambar hanya dipertahankan dalam memori giliran aktif (bounded memory), dan referensi visual dibersihkan saat reset atau setelah window forget timeout.
7. **D-07 (Pengungkapan Provider Eksternal):**
   - *Rekomendasi:* Beri label / hint jelas pada preview sebelum tombol kirim ditekan bahwa gambar akan dikirim ke provider yang dipilih untuk dianalisis.
8. **D-08 (Perilaku Model Tidak Mendukung):**
   - *Rekomendasi:* Jika model aktif tidak memiliki kapabilitas vision, tolak lampiran di UI dengan pesan edukatif yang ramah sebelum request dikirim ke main process.
9. **D-09 & D-10 (Identifikasi & OCR):**
   - *Rekomendasi:* Respons transkripsi visual dan identifikasi harus memisahkan observasi visual dari dugaan, dan tidak mengarang teks yang buram/tidak terbaca.

---

## 5. Kesimpulan P0 & Kesiapan Masuk P1

- **Status P0 Baseline dan Audit:** **PASS** (Memenuhi seluruh kriteria gate).
- **Kesiapan Fase Berikutnya:** Siap melanjutkan ke **P1 — Attachment Contract dan Validasi**.
- **Komitmen Keamanan & Stabilitas:** Kontrak teks lama `chatSend(text)` akan dipertahankan sepenuhnya kompatibel ke belakang (backward-compatible) tanpa memutus alur yang ada.
