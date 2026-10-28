'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AemeathThemeManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const GLASS_PRESETS = {
    blossom: { hue: 335, sat: '85%' },
    violet: { hue: 280, sat: '85%' },
    azure: { hue: 205, sat: '85%' },
    emerald: { hue: 155, sat: '80%' },
    obsidian: { hue: 225, sat: '15%' },
  };

  function applyTheme(settings, targetEl) {
    const el = targetEl || (typeof document !== 'undefined' ? document.body : null);
    if (!el) return;

    const theme = (settings && settings.theme) || 'default';
    const isGlass = theme === 'glass';

    el.classList.toggle('theme-glass', isGlass);

    if (isGlass) {
      const preset = (settings && settings.glassPreset) || 'violet';
      let hue = 280;
      let sat = '85%';

      if (preset !== 'custom' && GLASS_PRESETS[preset]) {
        hue = GLASS_PRESETS[preset].hue;
        sat = GLASS_PRESETS[preset].sat;
      } else if (typeof settings.glassHue === 'number') {
        hue = settings.glassHue;
      }

      const blur = typeof settings.glassBlur === 'number' ? settings.glassBlur : 20;
      const opacity = typeof settings.glassOpacity === 'number' ? settings.glassOpacity : 0.18;

      el.style.setProperty('--theme-hue', String(hue));
      el.style.setProperty('--theme-sat', sat);
      el.style.setProperty('--glass-blur', blur + 'px');
      el.style.setProperty('--glass-opacity', String(opacity));
      el.style.setProperty('--glass-card-opacity', String(Math.min(0.48, opacity + 0.07)));
      el.style.setProperty('--glass-border-opacity', String(Math.min(0.55, opacity + 0.12)));
    } else {
      el.style.removeProperty('--theme-hue');
      el.style.removeProperty('--theme-sat');
      el.style.removeProperty('--glass-blur');
      el.style.removeProperty('--glass-opacity');
      el.style.removeProperty('--glass-card-opacity');
      el.style.removeProperty('--glass-border-opacity');
    }
  }

  return {
    GLASS_PRESETS: GLASS_PRESETS,
    applyTheme: applyTheme,
  };
});
