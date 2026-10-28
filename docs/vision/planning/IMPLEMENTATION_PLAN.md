# Implementation Plan

## Target hasil

Satu alur chat terpadu untuk pesan teks dan gambar. Pengguna bisa memilih file atau paste gambar dari clipboard, melihat preview, menambahkan pertanyaan, lalu menerima analisis dari model vision yang kompatibel.

## Workstream A — Audit baseline

1. Checkout repository yang benar.
2. Catat branch dan commit SHA.
3. Baca implementasi chat UI, preload, IPC handler, service, provider, history, settings, dan tes.
4. Jalankan tes yang sudah tersedia tanpa mengubah kode.
5. Dokumentasikan baseline pass/fail.

Output: `baseline-report.md` di repository kerja.

## Workstream B — Data contract

Tentukan struktur internal attachment. Contoh konseptual:

```js
{
  type: 'image',
  mimeType: 'image/png',
  data: '<image-data>'
}
```

Ketentuan:
- Kontrak internal tidak harus sama dengan format API provider.
- Nama file hanya metadata tampilan dan tidak boleh dipercaya sebagai bukti tipe file.
- Tetapkan batas ukuran, dimensi, jumlah gambar, dan format berdasarkan audit serta batas provider.
- Hindari menaruh gambar mentah dalam log.
- Jangan menyimpan gambar di history persisten kecuali ada keputusan produk eksplisit.

## Workstream C — Renderer dan clipboard

1. Tambahkan attachment button dan file picker.
2. Deteksi clipboard image pada paste.
3. Jika clipboard hanya berisi teks, gunakan perilaku paste lama.
4. Preview sebelum pengiriman.
5. Hapus satu attachment tanpa menghapus teks prompt.
6. Berikan state idle, pending, uploading/processing, success, error, dan cancelled sesuai alur nyata.
7. Pastikan tombol send tidak mengirim attachment yang gagal divalidasi.

## Workstream D — IPC dan validasi

1. Gunakan preload bridge yang eksplisit, bukan membuka akses IPC umum.
2. Validasi struktur payload dan batas data di main process.
3. Pastikan renderer tidak memperoleh API key.
4. Terapkan batas ukuran sebelum melakukan konversi/base64 yang mahal jika memungkinkan.
5. Hindari temporary files kecuali diperlukan; jika diperlukan, gunakan direktori sementara dan cleanup teruji.
6. Jangan menerima path arbitrer dari renderer untuk dibaca tanpa validasi.

## Workstream E — Provider multimodal

1. Audit dokumentasi API resmi provider dan model yang tersedia.
2. Pastikan model terpilih mendukung input gambar, bukan hanya output teks.
3. Implementasikan format request multimodal sesuai dokumentasi tersebut.
4. Pertahankan timeout, abort signal, streaming, error classification, dan redaction.
5. Berikan pesan yang jelas untuk model unsupported, file invalid, rate limit, dan network failure.
6. Tes dengan mock; smoke test nyata harus dilaporkan terpisah.

## Workstream F — Intent dan response policy

Maksud awal yang perlu didukung:
- `describe_image`
- `extract_text`
- `translate_image_text`
- `identify_visual`
- `analyze_screenshot`
- `explain_diagram`
- `compare_images`

Ini adalah label perencanaan, bukan keharusan membuat classifier berbasis keyword. Gunakan model untuk memahami konteks jika sesuai. Satu pesan bisa memuat beberapa tugas.

Kebijakan jawaban:
- Sebutkan petunjuk yang terlihat.
- Tandai bagian yang tidak terbaca.
- Jangan mengarang identitas atau teks.
- Bedakan fakta visual dari dugaan.
- Pencarian web hanya jika membantu dan tersedia.
- Jangan menyatakan confidence numerik kecuali ada metode yang terdefinisi.

## Workstream G — History dan privasi

- Putuskan apakah pertanyaan lanjutan memakai image reference, data yang disimpan sementara, atau ringkasan visual.
- Batasi umur dan ukuran data.
- Pastikan reset chat membersihkan referensi terkait.
- Hindari log konten gambar.
- Beri disclosure sebelum gambar dikirim ke provider eksternal.
- Periksa perilaku ketika request gagal atau dibatalkan.

## Workstream H — Verification dan dokumentasi

Jalankan sesuai package scripts aktual:
- `npm test`
- `node scripts/verify.js`
- `npm run verify`

Jangan menganggap semua script ada atau sukses sebelum memeriksa `package.json` dan output. Tambahkan tes yang sesuai pola repo. Dokumentasikan command, hasil aktual, commit SHA, dan keterbatasan.

## Definition of Done

- Semua gate wajib lulus.
- Chat teks tidak mengalami regresi.
- Upload dan paste diuji.
- Provider/model vision diverifikasi.
- Error dan cancellation diuji.
- Privasi dan cleanup ditetapkan.
- Tidak ada checklist yang ditandai selesai tanpa bukti.
