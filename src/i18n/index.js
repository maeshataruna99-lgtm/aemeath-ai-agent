// Central i18n module for Aemeath.
// UMD so it works with require() in main/preloads/tests and as a script in renderers.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require);
  } else {
    root.AemeathI18n = factory(null);
  }
})(typeof self !== 'undefined' ? self : this, function (nodeRequire) {
  'use strict';

  const SUPPORTED_LOCALES = ['id-ID', 'en-US'];
  const DEFAULT_LOCALE = 'id-ID';

  let defaultCatalogs = null;
  if (typeof nodeRequire === 'function') {
    try {
      defaultCatalogs = {
        'id-ID': nodeRequire('./locales/id-ID.json'),
        'en-US': nodeRequire('./locales/en-US.json'),
      };
    } catch {
      defaultCatalogs = null;
    }
  }

  function normalizeLocale(loc) {
    if (typeof loc === 'string' && SUPPORTED_LOCALES.includes(loc)) {
      return loc;
    }
    return DEFAULT_LOCALE;
  }

  function getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && Object.prototype.hasOwnProperty.call(curr, part)) {
        curr = curr[part];
      } else {
        return undefined;
      }
    }
    return typeof curr === 'string' ? curr : undefined;
  }

  function interpolate(template, params) {
    if (!params || typeof params !== 'object') return template;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
      if (Object.prototype.hasOwnProperty.call(params, token)) {
        return String(params[token]);
      }
      return '{' + token + '}';
    });
  }

  function extractTokens(template) {
    const tokens = [];
    const regex = /\{([a-zA-Z0-9_]+)\}/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      tokens.push(match[1]);
    }
    return tokens.sort();
  }

  function createI18n(options) {
    const opts = options || {};
    let currentLocale = normalizeLocale(opts.locale);
    const catalogs = Object.assign({}, defaultCatalogs || {}, opts.catalogs || {});

    function t(key, params) {
      if (typeof key !== 'string') return '';
      const activeCatalog = catalogs[currentLocale];
      let val = getNestedValue(activeCatalog, key);

      // Fallback to default locale if missing in active catalog
      if (typeof val !== 'string' && currentLocale !== DEFAULT_LOCALE) {
        val = getNestedValue(catalogs[DEFAULT_LOCALE], key);
      }

      if (typeof val !== 'string') {
        return key;
      }

      return interpolate(val, params);
    }

    function setLocale(loc) {
      currentLocale = normalizeLocale(loc);
      return currentLocale;
    }

    function getLocale() {
      return currentLocale;
    }

    function getCatalog(loc) {
      const normalized = normalizeLocale(loc || currentLocale);
      return catalogs[normalized] || {};
    }

    function applyDom(container) {
      const root = container || (typeof document !== 'undefined' ? document : null);
      if (!root || typeof root.querySelectorAll !== 'function') return;

      const elements = root.querySelectorAll('[data-i18n]');
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const key = el.getAttribute('data-i18n');
        if (key) {
          el.textContent = t(key);
        }
      }

      const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
      for (let i = 0; i < placeholders.length; i++) {
        const el = placeholders[i];
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
          el.placeholder = t(key);
        }
      }

      const titles = root.querySelectorAll('[data-i18n-title]');
      for (let i = 0; i < titles.length; i++) {
        const el = titles[i];
        const key = el.getAttribute('data-i18n-title');
        if (key) {
          el.title = t(key);
        }
      }

      const arias = root.querySelectorAll('[data-i18n-aria]');
      for (let i = 0; i < arias.length; i++) {
        const el = arias[i];
        const key = el.getAttribute('data-i18n-aria');
        if (key) {
          el.setAttribute('aria-label', t(key));
        }
      }
    }

    return {
      t: t,
      setLocale: setLocale,
      getLocale: getLocale,
      getCatalog: getCatalog,
      applyDom: applyDom,
      SUPPORTED_LOCALES: SUPPORTED_LOCALES,
      DEFAULT_LOCALE: DEFAULT_LOCALE,
    };
  }

  function validateCatalogParity(catA, catB, prefix) {
    const pfx = prefix ? prefix + '.' : '';
    const missingInB = [];
    const missingInA = [];
    const tokenMismatches = [];

    const keysA = Object.keys(catA || {});
    const keysB = Object.keys(catB || {});

    for (const k of keysA) {
      if (k === 'locale') continue;
      const fullKey = pfx + k;
      if (!(k in catB)) {
        missingInB.push(fullKey);
      } else if (typeof catA[k] === 'object' && catA[k] !== null) {
        if (typeof catB[k] !== 'object' || catB[k] === null) {
          missingInB.push(fullKey);
        } else {
          const sub = validateCatalogParity(catA[k], catB[k], fullKey);
          missingInB.push(...sub.missingInB);
          missingInA.push(...sub.missingInA);
          tokenMismatches.push(...sub.tokenMismatches);
        }
      } else if (typeof catA[k] === 'string') {
        if (typeof catB[k] !== 'string') {
          missingInB.push(fullKey);
        } else {
          const tokensA = extractTokens(catA[k]);
          const tokensB = extractTokens(catB[k]);
          if (JSON.stringify(tokensA) !== JSON.stringify(tokensB)) {
            tokenMismatches.push({
              key: fullKey,
              tokensA: tokensA,
              tokensB: tokensB,
            });
          }
        }
      }
    }

    for (const k of keysB) {
      if (k === 'locale') continue;
      const fullKey = pfx + k;
      if (!(k in catA)) {
        missingInA.push(fullKey);
      }
    }

    return {
      missingInB: missingInB,
      missingInA: missingInA,
      tokenMismatches: tokenMismatches,
      isParity: missingInA.length === 0 && missingInB.length === 0 && tokenMismatches.length === 0,
    };
  }

  return {
    SUPPORTED_LOCALES: SUPPORTED_LOCALES,
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    normalizeLocale: normalizeLocale,
    createI18n: createI18n,
    validateCatalogParity: validateCatalogParity,
    defaultCatalogs: defaultCatalogs,
  };
});
