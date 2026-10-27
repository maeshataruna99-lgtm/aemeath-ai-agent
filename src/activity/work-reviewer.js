'use strict';

// Inspects the current git working tree to let Aemeath comment on and evaluate
// Rover's work in Full mode (/review or periodic work check).
// Runs git directly with shell: false. 100% local: no file, diff, or metric is
// ever sent to the internet or to any external AI model.

const { redact, containsSecret } = require('../chat/chat-error');

const MAX_DIFF_CHARS = 1800;
const GIT_TIMEOUT_MS = 5000;

const SENSITIVE_FILE_RE =
  /(?:^|[\\/])(?:\.env(?:\.[a-z0-9._-]+)?|chat-keys\.json|id_rsa[^\\/]*|id_ed25519[^\\/]*|[^\\/]*(?:secret|credential|apikey|api-key)[^\\/]*|[^\\/]+\.(?:key|pem|p12|pfx|kdbx))$/i;

function isSensitiveFile(filePath) {
  const clean = String(filePath || '')
    .replace(/^"+|"+$/g, '')
    .trim();
  if (!clean) return false;
  return SENSITIVE_FILE_RE.test(clean);
}

// Removes diff sections for sensitive files (.env, *.key, chat-keys.json, etc.)
// and redacts any inline API keys or secret assignments.
function sanitizeDiff(diffText, extraSecret) {
  const raw = String(diffText || '');
  if (!raw) return '';
  const blocks = raw.split(/(?=^diff --git )/m);
  const safeBlocks = [];
  for (const block of blocks) {
    const header = /^diff --git a\/(.+?) b\/(.+?)$/m.exec(block);
    if (header && (isSensitiveFile(header[1]) || isSensitiveFile(header[2]))) {
      continue;
    }
    safeBlocks.push(block);
  }
  return redact(safeBlocks.join(''), extraSecret);
}

function runGit(spawn, cwd, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('git', args, {
        cwd: cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        shell: false,
      });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(null);
    }, GIT_TIMEOUT_MS);
    if (child.stdout) {
      if (child.stdout.setEncoding) child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        if (out.length < 16000) out += chunk;
      });
    }
    child.once('error', () => finish(null));
    child.once('close', (code) => finish(code === 0 ? out : null));
  });
}

// Parses `git status --porcelain` and `git diff` into coarse, privacy-safe metrics
// without keeping sensitive file paths in remarks.
function analyzeGitOutput(statusText, diffText) {
  const lines = String(statusText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let modified = 0;
  let untracked = 0;
  let testFiles = 0;
  let codeFiles = 0;
  let secretWarnings = 0;

  for (const line of lines) {
    const code = line.slice(0, 2);
    const file = line.slice(3).trim();
    if (code === '??') untracked += 1;
    else modified += 1;
    if (isSensitiveFile(file)) secretWarnings += 1;
    if (/(?:^|[\\/])tests?[\\/]|\.(?:test|spec)\.[a-z0-9]+$/i.test(file)) testFiles += 1;
    if (/\.(?:js|ts|tsx|jsx|py|rs|go|java|cs|cpp|c|ps1|html|css)$/i.test(file)) codeFiles += 1;
  }

  const diff = String(diffText || '');
  const addedRawLines = diff.match(/^\+[^+].*$/gm) || [];
  const addedLines = addedRawLines.length;
  const removedLines = (diff.match(/^-[^-]/gm) || []).length;
  const todoMarkers = (diff.match(/^\+.*\b(?:TODO|FIXME|XXX)\b/gim) || []).length;
  const debugLogs = (diff.match(/^\+.*\bconsole\.log\s*\(/gm) || []).length;
  for (const added of addedRawLines) {
    if (containsSecret(added)) secretWarnings += 1;
  }

  return {
    totalFiles: lines.length,
    modified: modified,
    untracked: untracked,
    testFiles: testFiles,
    codeFiles: codeFiles,
    addedLines: addedLines,
    removedLines: removedLines,
    todoMarkers: todoMarkers,
    debugLogs: debugLogs,
    secretWarnings: secretWarnings,
  };
}

function formatLocalEvaluation(metrics) {
  if (!metrics || metrics.totalFiles === 0) {
    return {
      summary: 'Working tree bersih (tidak ada perubahan yang belum di-commit).',
      comment:
        'Pekerjaanmu rapi banget, Rover! Semua perubahan sudah bersih di git. Mau mulai fitur baru atau istirahat dulu?~',
    };
  }

  const parts = [
    'Berkas berubah: ' + metrics.modified + ' diubah, ' + metrics.untracked + ' baru',
    'Baris diff: +' + metrics.addedLines + ' / -' + metrics.removedLines,
    'Cakupan berkas: ' + metrics.codeFiles + ' kode, ' + metrics.testFiles + ' unit test',
  ];
  const notes = [];
  if (metrics.secretWarnings > 0) {
    notes.push(
      'Peringatan keamanan: terdeteksi ' +
        metrics.secretWarnings +
        ' potensi API key/kunci rahasia atau berkas sensitif (.env/key) di perubahan git! Pastikan selalu lokal dan masuk .gitignore.',
    );
  }
  if (metrics.codeFiles > 0 && metrics.testFiles === 0 && metrics.addedLines > 30) {
    notes.push('Ada cukup banyak kode baru tapi belum terlihat perubahan di berkas test.');
  } else if (metrics.testFiles > 0) {
    notes.push('Mantap, kamu ikut memperbarui unit test!');
  }
  if (metrics.debugLogs > 0) {
    notes.push('Terdeteksi ' + metrics.debugLogs + ' baris console.log baru di diff.');
  }
  if (metrics.todoMarkers > 0) {
    notes.push('Ada ' + metrics.todoMarkers + ' catatan TODO/FIXME baru.');
  }
  if (metrics.totalFiles >= 12 || metrics.addedLines >= 400) {
    notes.push('Perubahannya sudah lumayan besar; pertimbangkan dipecah jadi commit kecil agar mudah ditinjau.');
  }
  if (notes.length > 0) parts.push('Catatan: ' + notes.join(' '));

  let comment =
    'Aku sudah mengintip progres kerjamu (+' +
    metrics.addedLines +
    '/-' +
    metrics.removedLines +
    ' baris di ' +
    metrics.totalFiles +
    ' berkas). ';
  if (metrics.secretWarnings > 0) {
    comment +=
      'Hati-hati ya Rover, aku mendeteksi pola kunci API/rahasia atau berkas sensitif di perubahanmu—pastikan tetap lokal dan jangan sampai ikut di-commit!~';
  } else if (metrics.testFiles > 0 && metrics.debugLogs === 0) {
    comment += 'Kodenya terlihat terawat dan sudah ada unit test-nya, kerja bagus Rover!~';
  } else if (metrics.codeFiles > 0 && metrics.testFiles === 0 && metrics.addedLines > 30) {
    comment += 'Jangan lupa tambahkan atau jalankan unit test sebelum commit ya, biar aman!~';
  } else if (metrics.debugLogs > 0) {
    comment += 'Cek lagi kalau ada console.log sementara yang belum dihapus ya~';
  } else {
    comment += 'Semangat terus ngodingnya, sedikit demi sedikit makin jadi!~';
  }

  return {
    summary: parts.join('\n'),
    comment: comment,
  };
}

// options: { spawn, getCwd: () => string }
// Runs 100% locally on this machine; never sends diffs or file data over the network.
function createWorkReviewer(options) {
  const opts = options || {};
  const spawn = opts.spawn;
  const getCwd = opts.getCwd || (() => process.cwd());

  async function inspect() {
    if (typeof spawn !== 'function') return null;
    const cwd = getCwd();
    const statusText = await runGit(spawn, cwd, ['status', '--porcelain']);
    if (statusText === null) return null;
    const diffText = (await runGit(spawn, cwd, ['diff', '--no-color'])) || '';
    const metrics = analyzeGitOutput(statusText, diffText);
    const safeDiff = sanitizeDiff(diffText);
    return { metrics: metrics, diffSnippet: safeDiff.slice(0, MAX_DIFF_CHARS) };
  }

  async function review() {
    const inspected = await inspect();
    if (!inspected) {
      return {
        ok: false,
        text: 'Aku belum menemukan repositori git di folder kerja saat ini, Rover.',
      };
    }
    const local = formatLocalEvaluation(inspected.metrics);

    return {
      ok: true,
      text: local.comment,
      output: local.summary,
      metrics: inspected.metrics,
    };
  }

  return {
    inspect: inspect,
    review: review,
  };
}

module.exports = {
  createWorkReviewer,
  analyzeGitOutput,
  formatLocalEvaluation,
  isSensitiveFile,
  sanitizeDiff,
};
