# aemeth-ai-agent

Desktop pet Aemeth: berjalan di atas desktop, bereaksi terhadap aktivitas Anda, dan
memantau sesi AI Claude yang sedang berjalan.

## Fitur

- Berjalan-jalan di area kerja desktop, berhenti iseng, bisa digeser, dan diubah
  ukurannya (Ctrl+scroll atau menu tray).
- Klik Aemeth untuk membuatnya melompat; klik kanan untuk menu.
- Musik: mengikuti media session Windows dan menampilkan judul lagu di gelembung kecil.
- Sesi AI: membaca transkrip Claude Code di `~/.claude/projects`; saat sesi selesai
  Aemeth menampilkan ringkasan hasilnya, saat gagal animasi `failed` dengan pesan error.
- Tray: skala, kecepatan jalan, deteksi musik, pemantau sesi, reset posisi, keluar.

Pengaturan (skala, kecepatan, posisi) disimpan di user data aplikasi, bukan di repo.

## Menjalankan

Butuh Node.js 20+.

```powershell
npm install
npm start
```

## Test

```powershell
npm test
```

## Struktur

| Jalur | Isi |
|---|---|
| `main.js` | proses utama Electron: jendela overlay transparan, tray, watcher |
| `renderer/` | animasi sprite, bubble dialog, drag & resize |
| `src/` | atlas, walker, parser sesi, provider Claude Code, deteksi musik, settings |
| `assets/pet/` | spritesheet + atlas (sumber & lisensi di `NOTICE.md`) |
| `tests/` | unit test atlas, walker, parser, dan provider |

Status: tahap awal (prototipe).
