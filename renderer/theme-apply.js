'use strict';

/**
 * theme-apply.js
 * Menerapkan token semantik ke :root dan mendengar siaran theme:changed (P4.3).
 * Bekerja di semua jendela renderer: Pet/Chat (preload.js), Pengaturan (settings-preload.js),
 * dan Panduan Fitur (feature-preload.js).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AemeathThemeApply = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  /**
   * Menerapkan payload tema jadi ke document.
   * @param {{theme?: object, tokens?: Record<string, string>, effectiveMode?: string}} payload
   * @param {Document} [doc] - Dokumen target (default document global)
   * @returns {boolean} true jika token berhasil dipasang
   */
  function applyTheme(payload, doc) {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj || !payload || !payload.tokens || typeof payload.tokens !== 'object') {
      return false;
    }

    const rootEl = documentObj.documentElement;
    const bodyEl = documentObj.body;

    // Pasang seluruh variabel semantik --glass-* ke :root
    for (const [key, val] of Object.entries(payload.tokens)) {
      if (typeof key === 'string' && key.startsWith('--glass-') && val != null) {
        rootEl.style.setProperty(key, String(val));
      }
    }

    // Pasang kelas mode pada body jika tersedia
    if (bodyEl) {
      const mode = payload.effectiveMode || (payload.theme && payload.theme.mode) || 'dark';
      const isLight = mode === 'light';
      bodyEl.classList.toggle('mode-light', isLight);
      bodyEl.classList.toggle('mode-dark', !isLight);

      const reduce = Boolean(payload.theme && payload.theme.effects && payload.theme.effects.reduce);
      bodyEl.classList.toggle('reduce-effects', reduce);
    }

    // Simpan referensi payload aktif pada window
    if (typeof window !== 'undefined') {
      window.__aemeathTheme = payload;
      try {
        const event = new CustomEvent('aemeath:theme-applied', { detail: payload });
        documentObj.dispatchEvent(event);
      } catch {
        // Lingkungan tanpa CustomEvent (mis. pengujian Node polos)
      }
    }

    return true;
  }

  /**
   * Menginisialisasi listener IPC dan mengambil tema awal dari bridge yang tersedia.
   * @returns {void}
   */
  function initThemeApply() {
    if (typeof window === 'undefined') return;

    const bridge = window.aemeath || window.aemeathSettings || window.aemeathGuide;
    if (!bridge) return;

    // Dengarkan penyiaran perubahan tema dari proses utama
    if (typeof bridge.onThemeChanged === 'function') {
      bridge.onThemeChanged((payload) => {
        applyTheme(payload);
      });
    }

    // Ambil tema saat ini saat jendela pertama kali siap
    if (typeof bridge.getTheme === 'function') {
      Promise.resolve(bridge.getTheme())
        .then((payload) => {
          if (payload) applyTheme(payload);
        })
        .catch(() => {});
    }
  }

  // Jalankan otomatis jika di lingkungan browser
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initThemeApply, { once: true });
    } else {
      initThemeApply();
    }
  }

  return {
    applyTheme,
    initThemeApply,
  };
});
