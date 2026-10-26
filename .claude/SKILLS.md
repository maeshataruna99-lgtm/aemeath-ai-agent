# Lingkungan & daftar skill

Baca dulu `CLAUDE.md` di folder ini (aturan wajib, termasuk larangan credit/watermark AI).
Repo: GitHub `aemeath-ai-agent`

## Lingkungan kerja

| Item | Nilai |
|---|---|
| OS | Windows 11 Pro |
| Shell | PowerShell (utama), Git Bash |
| Folder lokal | `aemeth-ai-agent` (di dalam `IdeaProjects`) |
| AI utama | Claude Code (aplikasi desktop, tab Code) |
| Git | Remote di GitHub; folder lokal awalnya belum berupa git repo |

## Skill

Skill di bawah terpasang di lingkungan pemilik dan dipakai saat mengerjakan project ini.
AI lain yang tidak mendukung skill cukup memperlakukannya sebagai panduan cara kerja.

### Wajib / spesifik project

| Skill | Fungsi |
|---|---|
| `no-coauthored-by` | Menjaga commit & PR bebas trailer kredit AI. Salinan: `.claude/skills/no-coauthored-by/` |
| `commit-message` | Menulis pesan commit sesuai standar Conventional Commits. Salinan: `.claude/skills/commit-message/` |
| `watermarks-remover:remove-ai-marks` | Membersihkan penanda AI dari teks/dokumen/kode |
| `watermarks-remover:clean-user-facing-text` | Membersihkan teks yang tampil ke pengguna |
| `graphify` | Mengubah kode/dokumen jadi knowledge graph; dipakai untuk pertanyaan arsitektur |

### Proses kerja (superpowers)

`brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`,
`dispatching-parallel-agents`, `systematic-debugging`, `test-driven-development`,
`verification-before-completion`, `requesting-code-review`, `receiving-code-review`,
`using-git-worktrees`, `finishing-a-development-branch`, `writing-skills`.

### Rekayasa & desain

- Kode/arsitektur: `anthropic-skills:typescript-pro`, `nodejs-expert`, `api-designer`,
  `database-optimizer`, `playwright-expert`, `system-analyst`, `mermaid-diagram`,
  `prompt-engineer`, `chaos-engineer`, `claude-api`
- Review: `code-review`, `simplify`, `security-review`, `mattpocock-skills:*`
  (`tdd`, `code-review`, `diagnosing-bugs`, `domain-modeling`, `grilling`, dll.)
- UI/UX: `ui-ux-pro-max:*` (`ui-ux-pro-max`, `design`, `design-system`, `ui-styling`,
  `brand`, `banner-design`, `slides`)
- Dokumen/data: `anthropic-skills:docx`, `pdf`, `pptx`, `xlsx`, `docs`,
  `google-workspace`

### Utilitas

`context-mode:*` (hemat konteks, `ctx-stats`, `ctx-doctor`, …), `find-skills`,
`deepen-task`, `skill-inspector` (periksa skill sebelum dipasang), `update-config`,
`fewer-permission-prompts`, `loop`, `schedule`, `run`, `init`.

### Di luar lingkup project ini (terpasang, tidak dipakai di sini)

`anime-style`, `universal-modder:*`, `repair-mod`, `reverse-engineer-anything`,
`light-novel-plot-builder`, `game-developer`, `laravel-specialist`, serta generator
NestJS/Prisma (`nestjs-*`, `prisma-model-generator`, `getpage-optimizer`,
`getlist-dropdown-optimizer`, `table-db-optimizer`, `ts-function-builder`,
`vue-expert-js`).

> Catatan: daftar ini diambil dari skill yang terpasang saat dokumen ini dibuat
> (2026-10-26). Project baru berisi dokumen aturan ini, jadi "dipakai" berarti "tersedia
> dan relevan", bukan riwayat pemakaian. Perbarui bagian ini seiring skill baru benar-benar
> dipakai.

## Penegakan otomatis (Claude Code)

- `.claude/settings.json` memasang hook `PreToolUse` pada `Bash|PowerShell`.
- `.claude/hooks/block-coauthored-by.js` menolak `git commit` / `gh pr create|edit`
  yang mengandung `Co-Authored-By:` (exit code 2).
- `.claude/hooks/check-commit-message.js` menolak `git commit` yang pesannya tidak
  sesuai Conventional Commits (exit code 2).
- Butuh Node.js di PATH.

## Memindahkan lingkungan ke mesin lain

1. Clone repo ini; `.claude/` ikut terbawa.
2. Pasang plugin/skill yang dibutuhkan dari tabel di atas (opsional, untuk Claude Code).
3. Pastikan aturan di `.claude/CLAUDE.md` dipatuhi oleh AI apa pun yang dipakai.
