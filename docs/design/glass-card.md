# Glass Card — Referensi Desain untuk AI

Dokumen ini menjelaskan gaya **glassmorphism job card** supaya AI (Claude Code, Cursor, Copilot, dll.) bisa menirunya secara konsisten di repo ini. Kode acuannya ada di dua file di folder yang sama:

- `glass-card.css` — sumber kebenaran: semua token dan class.
- `glass-card.demo.html` — contoh markup lengkap, buka langsung di browser.

## Kapan dipakai

Dipakai untuk kartu informasi ringkas yang tampil di atas latar yang kaya visual (foto, gradien, sprite): kartu lowongan, kartu sesi AI, gelembung status, panel kecil. Jangan dipakai untuk area teks panjang atau form besar karena blur mengurangi keterbacaan.

## Anatomi

```
.glass-card
├── .glass-card__header      logo bulat (kiri) + .glass-card__badge (kanan)
├── .glass-card__meta        nama perusahaan + .glass-card__meta-time (redup)
├── .glass-card__title       judul besar, tebal, letter-spacing rapat
├── .glass-card__chips       satu atau lebih .glass-chip
├── .glass-card__divider     garis tipis 1px
└── .glass-card__footer      .glass-card__salary + .glass-card__location (kiri), .glass-btn (kanan)
```

## Token utama (CSS variables di `:root`)

| Token | Nilai | Fungsi |
|---|---|---|
| `--glass-bg` | `rgba(28,26,24,0.45)` | warna kaca, gelap dan semi-transparan |
| `--glass-blur` | `24px` | kekuatan blur latar |
| `--glass-saturate` | `1.15` | sedikit menaikkan saturasi latar yang menembus |
| `--glass-border` | `rgba(255,255,255,0.14)` | tepi tipis agar kartu terbaca |
| `--glass-radius` | `32px` | sudut kartu; chip `16px`, tombol `18px` |
| `--glass-text-muted` | `rgba(255,255,255,0.55)` | teks sekunder (waktu, lokasi) |
| `--glass-chip-bg` / `-border` | putih 8% / putih 18% | chip, badge, tombol |

## Aturan untuk AI

Lakukan:
- Ubah tampilan lewat CSS variables, jangan hardcode warna di class.
- Pertahankan hierarki: judul paling besar dan tebal, info sekunder kecil dan redup.
- Pakai satu keluarga font; judul pakai `letter-spacing` negatif (`-0.03em`).
- Pastikan ada sesuatu yang berwarna di belakang kartu, karena kaca tanpa latar hanya terlihat abu-abu.
- Tetap sediakan fallback `@supports` (sudah ada di CSS) agar tetap terbaca tanpa `backdrop-filter`.

Jangan:
- Menaikkan opasitas `--glass-bg` di atas ~0.6 untuk "memperbaiki kontras" tanpa menaikkan kontras teks; efek kacanya hilang.
- Menambah warna aksen baru. Warna aksen berasal dari foto atau latar, bukan dari UI.
- Menumpuk lebih dari satu kartu kaca saling menimpa (blur berlapis berat dan keruh).
- Memakai logo atau merek pihak ketiga yang asli sebagai contoh. Pakai placeholder (huruf inisial).

## Aturan konten (hal yang sering salah)

- Rentang gaji konsisten: `$150k – $220k`, bukan `$150 - $220k`.
- Lokasi tanpa koma ekstra: `Mountain View, CA`.
- Waktu relatif ditulis lowercase: `20 days ago`.

## Catatan khusus Electron (overlay transparan)

Repo ini memakai jendela Electron transparan untuk pet. Dua hal yang perlu diketahui:

1. `backdrop-filter` hanya mengaburkan konten **di dalam jendela itu sendiri**, bukan desktop di belakangnya. Pada jendela transparan, kartu kaca akan tampak hanya semi-transparan tanpa blur nyata. Kalau ingin efek blur desktop yang sungguhan, pakai opsi native seperti `backgroundMaterial: 'acrylic'` (Windows 11) pada `BrowserWindow`, bukan CSS.
2. Untuk gelembung bicara atau panel di atas sprite, tetap pakai class ini; yang terblur adalah sprite atau elemen halaman di belakangnya, dan itu sudah cukup memberi kesan kaca.

Jika mode "tembus klik" aktif, tambahkan `pointer-events: none` pada kartu yang murni informatif.

## Cara pakai singkat

```html
<link rel="stylesheet" href="docs/design/glass-card.css" />
<article class="glass-card"> ... </article>
```

Salin struktur dari `glass-card.demo.html`, ganti teksnya, dan sesuaikan token di `:root` bila perlu.
