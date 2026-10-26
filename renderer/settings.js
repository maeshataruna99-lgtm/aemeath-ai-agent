'use strict';

(function () {
  const chatter = document.getElementById('chatter');
  const interval = document.getElementById('interval');
  const value = document.getElementById('value');
  const range = document.getElementById('range');
  const intervalRow = interval.closest('.row');

  function format(minutes) {
    return String(Math.round(minutes * 10) / 10).replace('.', ',');
  }

  function render() {
    const minutes = Number(interval.value);
    const span = window.AemeathDialogue.chatIntervalRange(minutes);
    value.textContent = 'rata-rata ' + format(minutes) + ' menit';
    range.textContent =
      'Acak antara ' + format(span.minMs / 60000) + ' dan ' + format(span.maxMs / 60000) + ' menit.';
    intervalRow.classList.toggle('dim', !chatter.checked);
    interval.disabled = !chatter.checked;
  }

  async function boot() {
    const settings = await window.aemeathSettings.get();
    chatter.checked = settings.chatterEnabled !== false;
    interval.value = settings.chatterIntervalMin;
    render();
  }

  chatter.addEventListener('change', () => {
    render();
    window.aemeathSettings.set({ chatterEnabled: chatter.checked });
  });

  interval.addEventListener('input', render);
  // Persist when the slider is released, not on every pixel of movement.
  interval.addEventListener('change', () => {
    window.aemeathSettings.set({ chatterIntervalMin: Number(interval.value) });
  });

  boot();
})();
