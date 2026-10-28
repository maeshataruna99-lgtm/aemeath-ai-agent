# Decision Log

Record decisions before or during implementation. Do not silently invent product requirements.

| ID | Decision | Proposed default | Status |
|---|---|---|---|
| D-01 | Vision-capable provider/model | Verify official docs and account access first | OPEN |
| D-02 | Allowed image MIME types | PNG/JPEG/WebP only if supported end-to-end | RESOLVED |
| D-03 | Max image size | Choose after checking provider limits and memory impact | RESOLVED |
| D-04 | Max image count per message | Set an explicit conservative limit | RESOLVED |
| D-05 | Image persistence | In-memory only unless a documented need exists | RESOLVED |
| D-06 | Follow-up image context | Bounded lifetime; clear on reset | OPEN |
| D-07 | External provider disclosure | Show before first send or in a clear persistent notice | OPEN |
| D-08 | Unsupported model behavior | Explain that selected model cannot analyze images | RESOLVED |
| D-09 | Web search for visual identification | Only when useful and available; do not guarantee identification | OPEN |
| D-10 | OCR quality handling | Mark unclear or uncertain regions instead of guessing | OPEN |

## Decision records

- ID: D-02
  Chosen option: `image/png`, `image/jpeg`, `image/webp` dengan validasi byte signature (magic numbers).
  Reason: Format paling umum dan didukung oleh semua model vision modern; memblokir SVG/HTML untuk mencegah XSS; memblokir GIF/BMP untuk efisiensi payload.
  Date: 28 Oktober 2026
  Evidence / documentation: `src/chat/attachment.js`, `tests/chat-attachment.test.js`.

- ID: D-03
  Chosen option: Maksimal 5 MB (5.242.880 bytes) per berkas.
  Reason: Mencegah lonjakan penggunaan RAM pada proses Electron dan batas IPC.
  Date: 28 Oktober 2026
  Evidence / documentation: `MAX_IMAGE_BYTES` di `src/chat/attachment.js`.

- ID: D-04
  Chosen option: Maksimal 3 gambar per pesan (`MAX_ATTACHMENTS = 3`).
  Reason: Mendukung use case perbandingan gambar (image comparison) tanpa membebani konteks prompt model.
  Date: 28 Oktober 2026
  Evidence / documentation: `MAX_ATTACHMENTS` di `src/chat/attachment.js`.

- ID: D-05
  Chosen option: In-memory only (Buffer / base64); tidak ada penulisan berkas gambar ke disk dan tidak disimpan di riwayat persisten.
  Reason: Menjaga privasi Rover, mencegah kebocoran data pengguna di filesystem, dan menyederhanakan siklus pembersihan.
  Date: 28 Oktober 2026
  Evidence / documentation: `src/chat/chat-service.js`.

- ID: D-08
  Chosen option: Menghasilkan `ChatError('unsupported-capability')` secara terstruktur dengan pesan ramah.
  Reason: Mencegah pengiriman payload biner ke API teks yang pasti akan ditolak (400 Bad Request) atau memicu perilaku tak terduga.
  Date: 28 Oktober 2026
  Evidence / documentation: `src/chat/chat-service.js`, `tests/chat-service.test.js`.
