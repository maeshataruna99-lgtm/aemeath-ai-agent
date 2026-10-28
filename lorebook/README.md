# Lorebook

Trivia yang diucapkan Aemeath kepada Rover. Setiap entri ditulis ulang dengan
kata-kata sendiri (bukan salinan) dan selalu membawa sumbernya, yang ikut
ditampilkan di bubble.

## Isi folder

| File | Fungsi |
| --- | --- |
| `sources.json` | Daftar sumber: judul, URL, lisensi, tanggal diakses. |
| `solaris-3.json` | Trivia tentang planet Solaris-3. |
| `lore.json` | Trivia tentang istilah dunia (Lament, Resonator, Threnodian, dst). |
| `resonator.json` | Trivia mendalam tentang Resonator (Forte, Overclocking, umur panjang, Convene, dan daftar Resonator per wilayah). |
| `aemeath.json` | Trivia tentang Aemeath sendiri. |
| `backstory.json` | Trivia latar belakang dan masa lalu Aemeath. |

Semua `*.json` selain `sources.json` dimuat otomatis oleh
`src/lorebook-loader.js`. Menambah file baru tidak butuh perubahan kode.

## Format entri

```json
{
  "id": "unik-dalam-seluruh-lorebook",
  "topic": "Judul pendek topik",
  "source": "id-di-sources.json",
  "text": "Kalimat dalam suara Aemeath, Bahasa Indonesia, maksimal 260 karakter.",
  "status": "verified",
  "kind": "canon",
  "checkedAt": "2026-10-27"
}
```

### Keterangan Metadata Entri:
- **`status`**:
  - `verified`: Informasi telah diverifikasi kecocokannya dengan sumber primer game / wiki resmi.
  - `unverified`: Belum diverifikasi sepenuhnya; entri berstatus ini tidak pernah digunakan sebagai jawaban pasti.
- **`kind`**:
  - `canon`: Fakta resmi dan kanonis dari dunia Wuthering Waves.
  - `interpretation`: Penjelasan analitis atau interpretasi berbasis lore yang belum diucapkan secara eksplisit.
  - `evolving`: Informasi mengenai konten yang sedang atau akan berkembang (misal event patch baru atau wilayah mendatang).
- **`checkedAt`**: Tanggal verifikasi/pemeriksaan terakhir dalam format ISO `YYYY-MM-DD`.

Format sumber di `sources.json`:

```json
"wiki-contoh": {
  "title": "Nama yang tampil di bubble",
  "url": "https://...",
  "license": "CC BY-SA",
  "licenseUrl": "https://...",
  "accessed": "2026-10-26"
}
```

Tes (`npm test`) memeriksa bahwa id unik, setiap entri menunjuk sumber yang ada,
setiap sumber dipakai, dan teks tidak melebihi batas.

## Sumber dan lisensi

Folder ini dikecualikan dari lisensi kode proyek (PolyForm Noncommercial) dan
tetap berlisensi CC BY-SA, karena CC BY-SA mewajibkan pembagian ulang dengan
lisensi yang sama.

Fakta diambil dari Wuthering Waves Wiki di Fandom
(`wutheringwaves.fandom.com`). Teks komunitas di sana berlisensi CC BY-SA,
kecuali dinyatakan lain, jadi parafrasa di folder ini juga dibagikan dengan
lisensi yang sama (CC BY-SA) dan menyebut sumbernya per entri. Wuthering Waves
dan karakternya adalah milik Kuro Games; proyek ini penggemar dan tidak
berafiliasi.
