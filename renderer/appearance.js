'use strict';

/**
 * appearance.js
 * Logika antarmuka Tab Tampilan di Pengaturan (P4.4, P4.5, P4.6).
 * Mengatur live preview slider OKLCH, kartu kaca, penjaga kontras WCAG AA,
 * pemilihan preset, serta impor/ekspor tema JSON.
 */

(function () {
  // Rentang dan batas nilai bawaan (sesuai theme-schema.js)
  const LIMITS = {
    hue: { min: 0, max: 360, step: 1, default: 28 },
    chroma: { min: 0, max: 0.25, step: 0.005, default: 0.14 },
    lightness: { min: 0.30, max: 0.90, step: 0.01, default: 0.68 },
    opacity: { min: 0.10, max: 0.90, step: 0.01, default: 0.45 },
    blur: { min: 0, max: 40, step: 1, default: 24 },
    radius: { min: 8, max: 40, step: 1, default: 32 },
    border: { min: 0, max: 0.40, step: 0.01, default: 0.14 },
    scale: { min: 0.90, max: 1.20, step: 0.01, default: 1.0 },
  };

  let currentThemeState = null;
  let previewRafId = null;
  let saveDebounceTimer = null;

  // DOM Elements cache
  let elements = null;

  function queryElements() {
    return {
      panel: document.getElementById('theme-section') || document.getElementById('panel-appearance'),
      // Presets & modes
      presetButtons: document.querySelectorAll('.preset-btn'),
      modeRadios: document.querySelectorAll('input[name="theme-mode"]'),
      reduceEffectsCheckbox: document.getElementById('theme-reduce-effects'),
      btnResetPreset: document.getElementById('theme-btn-reset'),
      btnExport: document.getElementById('theme-btn-export'),
      btnImport: document.getElementById('theme-btn-import'),
      inputFile: document.getElementById('theme-import-file'),
      // Sliders & inputs
      sliderHue: document.getElementById('theme-slider-hue'),
      numHue: document.getElementById('theme-num-hue'),
      sliderChroma: document.getElementById('theme-slider-chroma'),
      numChroma: document.getElementById('theme-num-chroma'),
      sliderLightness: document.getElementById('theme-slider-lightness'),
      numLightness: document.getElementById('theme-num-lightness'),
      sliderOpacity: document.getElementById('theme-slider-opacity'),
      numOpacity: document.getElementById('theme-num-opacity'),
      sliderBlur: document.getElementById('theme-slider-blur'),
      numBlur: document.getElementById('theme-num-blur'),
      sliderRadius: document.getElementById('theme-slider-radius'),
      numRadius: document.getElementById('theme-num-radius'),
      sliderBorder: document.getElementById('theme-slider-border'),
      numBorder: document.getElementById('theme-num-border'),
      sliderScale: document.getElementById('theme-slider-scale'),
      numScale: document.getElementById('theme-num-scale'),
      // Preview card components
      previewPresetBadge: document.getElementById('preview-preset-badge'),
      previewModeChip: document.getElementById('preview-mode-chip'),
      previewContrastBadge: document.getElementById('preview-contrast-badge'),
      // Contrast warning
      contrastAlert: document.getElementById('contrast-alert'),
      contrastText: document.getElementById('contrast-text'),
      btnAutoFix: document.getElementById('contrast-autofix'),
    };
  }

  /**
   * Perbarui track gradien dan warna thumb slider secara dinamis.
   */
  function updateSliderTracks(accent, glass, text) {
    if (!elements) return;
    const h = accent.hue;
    const c = accent.chroma;
    const l = accent.lightness;

    // 1. Rona (Hue) track: pelangi OKLCH penuh
    elements.sliderHue.style.setProperty(
      '--track',
      'linear-gradient(90deg, oklch(0.7 0.15 0), oklch(0.7 0.15 60), oklch(0.7 0.15 120), oklch(0.7 0.15 180), oklch(0.7 0.15 240), oklch(0.7 0.15 300), oklch(0.7 0.15 360))'
    );
    elements.sliderHue.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);

    // 2. Intensitas (Chroma) track: dari abu ke saturasi penuh
    elements.sliderChroma.style.setProperty(
      '--track',
      `linear-gradient(90deg, oklch(${l.toFixed(2)} 0 ${h}), oklch(${l.toFixed(2)} 0.25 ${h}))`
    );
    elements.sliderChroma.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);

    // 3. Kecerahan (Lightness) track: dari gelap ke terang
    elements.sliderLightness.style.setProperty(
      '--track',
      `linear-gradient(90deg, oklch(0.30 ${c.toFixed(3)} ${h}), oklch(0.90 ${c.toFixed(3)} ${h}))`
    );
    elements.sliderLightness.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);

    // 4. Kaca slider tracks
    elements.sliderOpacity.style.setProperty(
      '--track',
      `linear-gradient(90deg, rgba(255,255,255,0.1), oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h}))`
    );
    elements.sliderOpacity.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);

    elements.sliderBlur.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);
    elements.sliderRadius.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);
    elements.sliderBorder.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);
    elements.sliderScale.style.setProperty('--thumb', `oklch(${l.toFixed(2)} ${c.toFixed(3)} ${h})`);
  }

  /**
   * Sinkronisasi nilai tema ke komponen form.
   */
  function syncFormControls(theme) {
    if (!elements || !theme) return;

    // Presets
    for (const btn of elements.presetButtons) {
      const match = btn.getAttribute('data-preset') === theme.preset;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-pressed', String(match));
    }

    // Modes
    for (const r of elements.modeRadios) {
      r.checked = r.value === theme.mode;
    }

    // Effects
    elements.reduceEffectsCheckbox.checked = Boolean(theme.effects && theme.effects.reduce);

    // Accent
    const accent = theme.accent || {};
    elements.sliderHue.value = accent.hue ?? LIMITS.hue.default;
    elements.numHue.value = accent.hue ?? LIMITS.hue.default;

    elements.sliderChroma.value = accent.chroma ?? LIMITS.chroma.default;
    elements.numChroma.value = accent.chroma ?? LIMITS.chroma.default;

    elements.sliderLightness.value = accent.lightness ?? LIMITS.lightness.default;
    elements.numLightness.value = accent.lightness ?? LIMITS.lightness.default;

    // Glass
    const glass = theme.glass || {};
    elements.sliderOpacity.value = Math.round((glass.opacity ?? LIMITS.opacity.default) * 100);
    elements.numOpacity.value = Math.round((glass.opacity ?? LIMITS.opacity.default) * 100);

    elements.sliderBlur.value = glass.blur ?? LIMITS.blur.default;
    elements.numBlur.value = glass.blur ?? LIMITS.blur.default;

    elements.sliderRadius.value = glass.radius ?? LIMITS.radius.default;
    elements.numRadius.value = glass.radius ?? LIMITS.radius.default;

    elements.sliderBorder.value = Math.round((glass.border ?? LIMITS.border.default) * 100);
    elements.numBorder.value = Math.round((glass.border ?? LIMITS.border.default) * 100);

    // Text
    const text = theme.text || {};
    elements.sliderScale.value = Math.round((text.scale ?? LIMITS.scale.default) * 100);
    elements.numScale.value = Math.round((text.scale ?? LIMITS.scale.default) * 100);

    // Update track visual gradients
    updateSliderTracks(accent, glass, text);

    // Update preview card badges
    if (elements.previewPresetBadge) {
      elements.previewPresetBadge.textContent =
        theme.preset === 'custom' ? 'Kustom (Slider)' : theme.preset.replace('-', ' ').toUpperCase();
    }
    if (elements.previewModeChip) {
      elements.previewModeChip.textContent =
        theme.mode === 'system' ? 'Sistem OS' : theme.mode === 'light' ? 'Mode Terang' : 'Mode Gelap';
    }
  }

  /**
   * Menampilkan status rasio kontras WCAG AA.
   */
  function updateContrastDisplay(contrast) {
    if (!elements || !contrast) return;

    const ratio = contrast.mainRatio || 0;
    const passes = contrast.passesMain;

    if (elements.previewContrastBadge) {
      elements.previewContrastBadge.textContent = `WCAG ${ratio}:1 ${passes ? '✓' : '⚠️'}`;
      elements.previewContrastBadge.style.color = passes ? 'var(--glass-status-ok)' : 'var(--glass-status-warn)';
    }

    if (elements.contrastAlert) {
      if (!passes) {
        elements.contrastAlert.classList.remove('hidden');
        elements.contrastAlert.classList.remove('ok');
        elements.contrastText.textContent = `Peringatan: Rasio kontras teks utama (${ratio}:1) di bawah standar WCAG AA (4,5:1). Teks mungkin sulit terbaca.`;
        if (elements.btnAutoFix) {
          elements.btnAutoFix.style.display = 'inline-block';
        }
      } else {
        elements.contrastAlert.classList.remove('hidden');
        elements.contrastAlert.classList.add('ok');
        elements.contrastText.textContent = `Kualitas kontras optimal: ${ratio}:1 (Lolos standar WCAG AA).`;
        if (elements.btnAutoFix) {
          elements.btnAutoFix.style.display = 'none';
        }
      }
    }
  }

  /**
   * Mengumpulkan state dari input UI.
   */
  function gatherFormPatch() {
    if (!elements) return {};
    let selectedMode = 'dark';
    for (const r of elements.modeRadios) {
      if (r.checked) {
        selectedMode = r.value;
        break;
      }
    }

    return {
      mode: selectedMode,
      accent: {
        hue: Number(elements.sliderHue.value),
        chroma: Number(elements.sliderChroma.value),
        lightness: Number(elements.sliderLightness.value),
      },
      glass: {
        opacity: Number(elements.sliderOpacity.value) / 100,
        blur: Number(elements.sliderBlur.value),
        radius: Number(elements.sliderRadius.value),
        border: Number(elements.sliderBorder.value) / 100,
      },
      text: {
        scale: Number(elements.sliderScale.value) / 100,
      },
      effects: {
        reduce: elements.reduceEffectsCheckbox.checked,
      },
    };
  }

  /**
   * Kirim pratinjau langsung ke proses utama via requestAnimationFrame (throttle).
   */
  function triggerPreview() {
    if (previewRafId) cancelAnimationFrame(previewRafId);

    previewRafId = requestAnimationFrame(async () => {
      const patch = gatherFormPatch();
      updateSliderTracks(patch.accent, patch.glass, patch.text);

      if (window.aemeathSettings && typeof window.aemeathSettings.previewTheme === 'function') {
        const payload = await window.aemeathSettings.previewTheme(patch);
        if (payload && payload.contrast) {
          updateContrastDisplay(payload.contrast);
        }
      }
    });
  }

  /**
   * Simpan perubahan permanen ke proses utama (debounce).
   */
  function triggerSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);

    saveDebounceTimer = setTimeout(async () => {
      const patch = gatherFormPatch();
      if (window.aemeathSettings && typeof window.aemeathSettings.setTheme === 'function') {
        const payload = await window.aemeathSettings.setTheme(patch);
        if (payload && payload.theme) {
          currentThemeState = payload.theme;
          syncFormControls(payload.theme);
          if (payload.contrast) updateContrastDisplay(payload.contrast);
        }
      }
    }, 250);
  }

  /**
   * Pasang event listeners untuk slider dan input numerik kembar.
   */
  function bindSlider(sliderEl, numEl, isPercent = false, stepMul = 1) {
    if (!sliderEl || !numEl) return;

    function onSliderMove() {
      numEl.value = sliderEl.value;
      triggerPreview();
      triggerSave();
    }

    function onNumInput() {
      sliderEl.value = numEl.value;
      triggerPreview();
      triggerSave();
    }

    sliderEl.addEventListener('input', onSliderMove);
    sliderEl.addEventListener('change', onSliderMove);
    numEl.addEventListener('input', onNumInput);
    numEl.addEventListener('change', onNumInput);

    // Keyboard navigation: Shift+panah loncat 10x
    sliderEl.addEventListener('keydown', (e) => {
      if (e.shiftKey) {
        const delta = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 10 * stepMul :
                      (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -10 * stepMul : 0;
        if (delta !== 0) {
          e.preventDefault();
          const next = Number(sliderEl.value) + delta;
          sliderEl.value = next;
          numEl.value = next;
          triggerPreview();
          triggerSave();
        }
      }
    });

    // Double click untuk snap/reset ke bawaan
    sliderEl.addEventListener('dblclick', () => {
      const field = sliderEl.getAttribute('data-field');
      if (field && LIMITS[field]) {
        const def = isPercent ? Math.round(LIMITS[field].default * 100) : LIMITS[field].default;
        sliderEl.value = def;
        numEl.value = def;
        triggerPreview();
        triggerSave();
      }
    });
  }

  /**
   * Inisialisasi seluruh event listener di tab Tampilan.
   */
  function initEvents() {
    // 1. Sliders & Inputs
    bindSlider(elements.sliderHue, elements.numHue, false, 1);
    bindSlider(elements.sliderChroma, elements.numChroma, false, 0.005);
    bindSlider(elements.sliderLightness, elements.numLightness, false, 0.01);
    bindSlider(elements.sliderOpacity, elements.numOpacity, true, 1);
    bindSlider(elements.sliderBlur, elements.numBlur, false, 1);
    bindSlider(elements.sliderRadius, elements.numRadius, false, 1);
    bindSlider(elements.sliderBorder, elements.numBorder, true, 1);
    bindSlider(elements.sliderScale, elements.numScale, true, 1);

    // 2. Preset buttons
    for (const btn of elements.presetButtons) {
      btn.addEventListener('click', async () => {
        const presetName = btn.getAttribute('data-preset');
        if (!presetName) return;

        if (window.aemeathSettings && typeof window.aemeathSettings.setThemePreset === 'function') {
          const payload = await window.aemeathSettings.setThemePreset(presetName);
          if (payload && payload.theme) {
            currentThemeState = payload.theme;
            syncFormControls(payload.theme);
            if (payload.contrast) updateContrastDisplay(payload.contrast);
          }
        }
      });
    }

    // 3. Mode radios
    for (const r of elements.modeRadios) {
      r.addEventListener('change', () => {
        triggerPreview();
        triggerSave();
      });
    }

    // 4. Reduce effects checkbox
    elements.reduceEffectsCheckbox.addEventListener('change', () => {
      triggerPreview();
      triggerSave();
    });

    // 5. Tombol Reset ke Preset aktif
    if (elements.btnResetPreset) {
      elements.btnResetPreset.addEventListener('click', async () => {
        const targetPreset = (currentThemeState && currentThemeState.preset !== 'custom')
          ? currentThemeState.preset
          : 'midnight-glass';

        if (window.aemeathSettings && typeof window.aemeathSettings.setThemePreset === 'function') {
          const payload = await window.aemeathSettings.setThemePreset(targetPreset);
          if (payload && payload.theme) {
            currentThemeState = payload.theme;
            syncFormControls(payload.theme);
            if (payload.contrast) updateContrastDisplay(payload.contrast);
          }
        }
      });
    }

    // 6. Tombol Perbaiki Otomatis Kontras
    if (elements.btnAutoFix) {
      elements.btnAutoFix.addEventListener('click', async () => {
        if (!window.aemeathSettings) return;
        const currentPayload = await window.aemeathSettings.getTheme();
        const autoFix = currentPayload?.contrast?.autoFix;
        if (autoFix && autoFix.needed && typeof autoFix.recommendedOpacity === 'number') {
          const patch = {
            glass: { opacity: autoFix.recommendedOpacity },
          };
          const payload = await window.aemeathSettings.setTheme(patch);
          if (payload && payload.theme) {
            currentThemeState = payload.theme;
            syncFormControls(payload.theme);
            if (payload.contrast) updateContrastDisplay(payload.contrast);
          }
        }
      });
    }

    // 7. Ekspor Tema ke JSON (P4.6)
    if (elements.btnExport) {
      elements.btnExport.addEventListener('click', async () => {
        if (!window.aemeathSettings) return;
        const payload = await window.aemeathSettings.getTheme();
        if (!payload || !payload.theme) return;

        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload.theme, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute('download', `aemeath-theme-${payload.theme.preset || 'custom'}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      });
    }

    // 8. Impor Tema dari JSON (P4.6)
    if (elements.btnImport && elements.inputFile) {
      elements.btnImport.addEventListener('click', () => {
        elements.inputFile.click();
      });

      elements.inputFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            if (parsed && typeof parsed === 'object') {
              const payload = await window.aemeathSettings.setTheme(parsed);
              if (payload && payload.theme) {
                currentThemeState = payload.theme;
                syncFormControls(payload.theme);
                if (payload.contrast) updateContrastDisplay(payload.contrast);
              }
            }
          } catch (err) {
            alert('Gagal mengimpor berkas tema: Format JSON tidak valid.');
          } finally {
            elements.inputFile.value = '';
          }
        };
        reader.readAsText(file);
      });
    }

    // 9. Dengarkan siaran perubahan tema dari luar (misal dari tray)
    if (window.aemeathSettings && typeof window.aemeathSettings.onThemeChanged === 'function') {
      window.aemeathSettings.onThemeChanged((payload) => {
        if (payload && payload.theme) {
          currentThemeState = payload.theme;
          syncFormControls(payload.theme);
          if (payload.contrast) updateContrastDisplay(payload.contrast);
        }
      });
    }
  }

  /**
   * Booting tab Tampilan saat DOM siap.
   */
  async function boot() {
    elements = queryElements();
    if (!elements.panel) return;

    initEvents();

    // Ambil tema awal dari proses utama
    if (window.aemeathSettings && typeof window.aemeathSettings.getTheme === 'function') {
      try {
        const payload = await window.aemeathSettings.getTheme();
        if (payload && payload.theme) {
          currentThemeState = payload.theme;
          syncFormControls(payload.theme);
          if (payload.contrast) updateContrastDisplay(payload.contrast);
        }
      } catch {
        // Fallback or offline
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
