# Spec & Roadmap: Sistem Tema Aemeath (P4)

Status: usulan. Dokumen ini membahas satu fitur: **pilihan tema yang mengubah seluruh tampilan UI** (gelembung bicara, kotak chat, jendela Pengaturan, lencana, kartu), lengkap dengan **kustomisasi warna lewat slider**. Gaya kaca acuannya ada di `docs/design/glass-card.md` dan `glass-card.css`.

Catatan penomoran: `ROADMAP.md` memakai P0 sampai P3 dengan item `fase.nomor`. Fitur ini diusulkan sebagai **P4 — Tema & personalisasi tampilan**, karena belum ada item tema di roadmap yang ada.

## 1. Tujuan dan non-tujuan

Tujuan:
- Pengguna bisa mengganti tampilan seluruh UI dengan satu pilihan (preset) dan menyetelnya halus lewat slider.
- Perubahan terlihat langsung (live preview) di semua jendela tanpa restart.
- Teks tetap terbaca di semua kombinasi warna (ada penjaga kontras).
- Semua gaya berasal dari satu sumber token, jadi AI atau kontributor lain cukup mengubah token, bukan memburu warna hardcode.

Non-tujuan (di luar lingkup P4):
- Mewarnai ulang sprite Aemeath. Sprite berlisensi MIT dari pihak lain dan tetap apa adanya.
- CSS bebas buatan pengguna atau marketplace tema.
- Tema untuk menu tray. Menu tray bersifat native OS, jadi hanya bisa diberi pilihan preset lewat submenu, tanpa slider.

## 2. Prinsip desain

1. **Satu sumber kebenaran.** Semua warna, blur, radius, dan ukuran teks adalah CSS variable di `:root`. Tidak ada nilai hardcode di komponen.
2. **Satu warna aksen menurunkan sisanya.** Pengguna memilih hue aksen, sistem menurunkan permukaan, border, chip, dan teks redup dari situ. Pengguna tidak perlu mengatur dua puluh warna.
3. **Aman secara default.** Nilai slider dibatasi (clamp), kontras dicek otomatis, dan nilai tidak valid ditolak.
4. **Konsisten dengan kebijakan keamanan repo.** Tema berupa data (angka dan hex), bukan CSS bebas. Jendela renderer tidak menerima string CSS sembarang.
5. **Tetap ringan.** Blur itu mahal, jadi ada pengaturan "Kurangi efek" dan fallback tanpa `backdrop-filter`.

## 3. Cakupan UI yang terdampak

| Area | Sumber | Dampak tema |
|---|---|---|
| Gelembung bicara dan lencana musik | `renderer/pet.js` + CSS terkait | warna kaca, teks, radius |
| Kotak chat | `renderer/chat-panel.js` | permukaan, bubble pesan, input |
| Jendela Pengaturan (4 tab, akan jadi 5) | `renderer/` (settings) | seluruh komponen form |
| Tawaran memori / Resume Work | balon di `pet.js` | tombol dan chip |
| Menu tray | `main.js` | hanya submenu pilihan preset |

Catatan: nama file renderer di atas diambil dari README; verifikasi jalur persisnya di repo sebelum refactor.

## 4. Model tema

### 4.A Tiga lapis token

```
Primitif   hue, chroma, lightness, opacity, blur, radius, skala-teks    ← diatur pengguna
   ↓ diturunkan oleh src/theme/derive.js
Semantik   --glass-bg, --glass-border, --glass-text, --glass-text-muted,
           --glass-chip-bg, --glass-accent, --glass-divider            ← dipakai komponen
   ↓
Komponen   .glass-card, .glass-chip, .glass-btn, .chat-bubble, ...     ← hanya membaca token semantik
```

Token semantik memakai nama yang sama dengan `glass-card.css` supaya kartu referensi langsung kompatibel.

### 4.B Skema tema (JSON)

```json
{
  "version": 1,
  "mode": "dark",
  "preset": "midnight-glass",
  "accent": { "hue": 28, "chroma": 0.14, "lightness": 0.68 },
  "glass": { "opacity": 0.45, "blur": 24, "radius": 32, "border": 0.14 },
  "text": { "scale": 1.0 },
  "effects": { "reduce": false }
}
```

Aturan validasi (wajib, dijalankan di proses utama):
- Semua angka di-clamp ke rentang slider (lihat bagian 5).
- `mode` hanya `dark`, `light`, atau `system`. `preset` hanya nama dari daftar bawaan atau `custom`.
- Nilai lain dibuang. Tidak ada string CSS yang diterima.

### 4.C Preset bawaan (usulan awal)

| Preset | Karakter |
|---|---|
| Midnight Glass (bawaan) | gelap kehijauan, kaca semi-transparan, aksen oranye hangat (sesuai kartu referensi) |
| Soft Light | terang, kaca putih, aksen pastel |
| Mono | abu netral, tanpa aksen, efek minimal |
| Aemeath | palet terinspirasi karakter; warna persisnya ditentukan pemilik repo |
| Custom | hasil slider pengguna |

Preset adalah titik awal. Menggeser slider mengubah label menjadi "Custom" dan tombol Reset mengembalikan ke preset terakhir.

## 5. UX slider warna

Lokasi: tab baru **Tampilan** di jendela Pengaturan (tab kelima), dengan kartu pratinjau langsung di atas slider.

### 5.1 Kelompok slider

| Kelompok | Slider | Rentang | Bawaan |
|---|---|---|---|
| Warna | Rona (hue) | 0–360 | 28 |
| Warna | Intensitas (chroma) | 0–0.25 | 0.14 |
| Warna | Kecerahan aksen | 0.3–0.9 | 0.68 |
| Kaca | Opasitas | 10–90% | 45% |
| Kaca | Blur | 0–40 px | 24 |
| Kaca | Sudut (radius) | 8–40 px | 32 |
| Kaca | Kekuatan border | 0–40% | 14% |
| Teks | Ukuran teks | 90–120% | 100% |

Warna dihitung di ruang **OKLCH** supaya menggeser hue tidak mengubah kecerahan yang dirasakan mata (di HSL, kuning selalu tampak lebih terang dari biru pada nilai L yang sama).

### 5.2 Perilaku slider (agar terasa bagus)

- **Track hidup.** Track slider rona menampilkan pelangi hue sungguhan; track intensitas bergradasi dari abu ke warna penuh pada hue saat ini; track kecerahan dari gelap ke terang. Pengguna melihat hasil sebelum menggeser.
- **Thumb berwarna** sesuai nilai saat ini, dengan ring putih tipis agar terlihat di segala latar.
- **Nilai terlihat.** Gelembung angka muncul di atas thumb saat digeser, dan ada input angka di sampingnya untuk presisi.
- **Live preview.** Kartu pratinjau dan seluruh jendela berubah saat digeser (throttle lewat `requestAnimationFrame`), lalu disimpan setelah slider dilepas (debounce).
- **Snap ke bawaan.** Dekat nilai bawaan ada tarikan halus (magnetic) dan tanda kecil di track; klik dua kali pada slider mengembalikan nilainya ke bawaan.
- **Keyboard penuh.** Panah ±1, Shift+panah ±10, Home/End ke batas. Fokus punya outline jelas.
- **Hormati `prefers-reduced-motion`.** Tanpa animasi transisi pada thumb dan pratinjau.

### 5.3 Penjaga kontras

- Setelah tiap perubahan, hitung rasio kontras antara teks utama dan permukaan efektif (permukaan dicampur dengan latar rata-rata).
- Di bawah 4,5:1: tampilkan peringatan kecil di samping kelompok slider, dan otomatis menggeser teks ke putih atau hitam.
- Teks redup tidak boleh di bawah 3:1.
- Tombol "Perbaiki otomatis" menaikkan opasitas permukaan secukupnya.

### 5.4 Contoh CSS slider (referensi untuk AI lain)

```css
.theme-slider {
  --track: linear-gradient(90deg, #444, #ccc); /* diganti per slider lewat JS */
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--track);
  outline: none;
}
.theme-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--thumb, #fff);        /* warna nilai saat ini */
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  cursor: grab;
  transition: transform 0.12s ease;
}
.theme-slider:active::-webkit-slider-thumb { transform: scale(1.15); cursor: grabbing; }
.theme-slider:focus-visible::-webkit-slider-thumb { outline: 2px solid #fff; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .theme-slider::-webkit-slider-thumb { transition: none; }
}
```

Track rona dibuat dengan `linear-gradient(90deg, oklch(0.7 0.15 0), oklch(0.7 0.15 60), ... oklch(0.7 0.15 360))`.

## 6. Arsitektur

```
src/theme/
  theme-schema.js    validasi dan clamp (satu-satunya pintu masuk data tema)
  derive.js          primitif → token semantik (OKLCH → hex/rgba)
  contrast.js        hitung rasio kontras, saran perbaikan
  presets.js         daftar preset bawaan
  theme-store.js     baca/tulis tema, migrasi versi
renderer/
  theme.css          nilai bawaan token + gaya komponen berbasis var(--glass-*)
  theme-apply.js     menerapkan token ke :root dan mendengar perubahan
  settings/appearance.js   UI tab Tampilan (slider, pratinjau)
tests/theme/         unit test semua modul di atas
```

Alur data:
1. Tab Tampilan memanggil `theme:preview` (belum disimpan) dan `theme:set` (disimpan) lewat preload.
2. Proses utama memvalidasi lewat `theme-schema.js`, menurunkan token lewat `derive.js`, lalu menyimpan.
3. Proses utama menyiarkan `theme:changed` berisi **token jadi** ke semua jendela (pet, chat, Pengaturan).
4. `theme-apply.js` di tiap jendela memasang token ke `:root`. Jendela tidak pernah menerima CSS mentah.

Penyimpanan: berkas `theme.json` (berversi) di folder data aplikasi, mengikuti pola `memory.json`: berkas rusak dipindahkan ke `theme.corrupt-<waktu>.json`, bukan ditimpa; berkas dari versi lebih baru hanya dibaca.

Mode sistem: `nativeTheme` Electron dipakai untuk opsi "Ikuti sistem" (gelap/terang) di Windows dan Linux Mint.

### Catatan Electron

- `backdrop-filter` pada jendela transparan hanya mengaburkan isi jendela itu sendiri, bukan desktop di belakangnya. Di overlay pet, kartu kaca akan tampak semi-transparan tanpa blur desktop nyata. Untuk panel yang ingin blur desktop sungguhan (misalnya jendela Pengaturan), pertimbangkan `backgroundMaterial: 'acrylic'` di Windows 11; di Linux Mint tidak ada padanannya, jadi pakai fallback opasitas.
- Slider Blur dinonaktifkan (abu-abu, dengan keterangan) pada jendela yang tidak mendukung efeknya, supaya pengguna tidak bingung.
- Mode transparan/tembus klik yang sudah ada tetap berlaku; opasitas sprite dan opasitas kaca adalah dua pengaturan terpisah.

## 7. Roadmap P4 — Tema & personalisasi tampilan

Ukuran: S (kecil), M (sedang), L (besar). Urutan disarankan: 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6.

### 4.1 Fondasi token (M)
- Ekstrak semua warna, blur, radius, dan ukuran teks yang hardcode di CSS renderer menjadi variable di `renderer/theme.css`, memakai nama dari `glass-card.css`.
- Hasil: tampilan identik dengan sebelumnya (refactor murni, tanpa fitur baru).
- Selesai bila: tidak ada lagi warna literal di CSS komponen (cek dengan grep), dan `--selfie` menghasilkan tangkapan layar yang sama.

### 4.2 Mesin tema (M)
- `theme-schema.js`, `derive.js`, `contrast.js`, `presets.js`, `theme-store.js`, beserta unit test.
- Selesai bila: input acak/ekstrem tidak pernah menghasilkan token di luar rentang; derivasi OKLCH punya test nilai acuan; berkas rusak dan versi lebih baru tertangani.

### 4.3 IPC dan penyiaran (S)
- `theme:get`, `theme:preview`, `theme:set`, `theme:changed`, dipaparkan lewat preload yang ada (`preload.js`, `settings-preload.js`).
- Selesai bila: mengubah tema di Pengaturan langsung terlihat di jendela pet dan chat tanpa restart, dan jendela renderer tidak bisa mengirim CSS mentah.

### 4.4 Tab Tampilan dengan slider (L)
- Tab kelima di Pengaturan: pilih preset, slider warna dan kaca, kartu pratinjau, tombol Reset, mode Gelap/Terang/Sistem, toggle "Kurangi efek".
- Slider sesuai bagian 5.2 (track hidup, thumb berwarna, input angka, keyboard, snap).
- Selesai bila: semua slider bisa dipakai dengan keyboard saja, dan pratinjau tidak patah saat digeser cepat.

### 4.5 Penjaga kontras dan aksesibilitas (S)
- Peringatan kontras, "Perbaiki otomatis", dukungan `prefers-reduced-motion`, fallback tanpa `backdrop-filter`.
- Selesai bila: tidak ada kombinasi slider yang menghasilkan teks utama di bawah 4,5:1 setelah koreksi otomatis.

### 4.6 Impor/ekspor dan menu tray (S)
- Ekspor tema ke berkas JSON dan impor kembali (melewati validasi yang sama); submenu "Tema" di tray untuk berganti preset cepat.
- Selesai bila: berkas impor yang berisi nilai di luar rentang atau kunci asing ditolak atau dibersihkan, bukan diterapkan.

## 8. Rencana pengujian

- **Unit:** clamp dan validasi skema, derivasi OKLCH, rasio kontras, migrasi versi, penanganan berkas rusak.
- **Visual:** perluas `npx electron . --selfie` agar menyimpan tangkapan layar tiap preset untuk pet, chat, dan tiap tab Pengaturan ke `.verify/`.
- **Manual (Windows 11 dan Linux Mint):** geser semua slider ekstrem, ganti preset berulang kali, mode transparan aktif, "Kurangi efek" aktif, mode terang dan gelap sistem.
- **Keamanan:** pastikan impor JSON jahat (kunci asing, string panjang, nilai non-angka) tidak pernah sampai ke `:root`.

## 9. Risiko dan pertanyaan terbuka

| Risiko / pertanyaan | Mitigasi / usulan |
|---|---|
| Blur berat di PC lemah | toggle "Kurangi efek", default blur sedang, fallback opasitas |
| Kombinasi warna ekstrem merusak keterbacaan | penjaga kontras otomatis (4.5) |
| Tema terang kurang cocok dengan sprite yang dibuat untuk latar gelap | pratinjau sprite di tiap preset sebelum dirilis |
| Berapa preset bawaan yang cukup | mulai dari 4 (Midnight Glass, Soft Light, Mono, Aemeath), tambah bila ada permintaan |
| Apakah gelembung bicara boleh punya warna aksen terpisah dari UI lain | usulan: tidak di P4; satu aksen untuk semua |
| Palet preset "Aemeath" | perlu keputusan pemilik repo |

## 10. Cara memakai dokumen ini

Salin bagian 7 ke `ROADMAP.md` sebagai `## P4 — Tema & personalisasi tampilan` dengan item 4.1–4.6 mengikuti format yang sudah ada. Bagian lain tetap di `docs/design/` sebagai rujukan implementasi.
