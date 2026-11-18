/* Raster character showcase. Viewing never calls the profile, ad or payment APIs. */
(() => {
  'use strict';
  const moods = [
    ['idle', 'Ожидание'], ['joy', 'Радость'], ['failure', 'Разочарование'],
    ['win', 'Победа'], ['loss', 'Поражение'],
  ];
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  function create(character) {
    const root = make('section', null, 'tg-showcase-art');
    root.dataset.character = character.id;
    root.setAttribute('aria-label', `Бесплатный предпросмотр: ${character.name}`);
    const stage = make('figure', null, 'tg-art-stage');
    stage.dataset.state = 'idle';
    stage.dataset.mode = 'portrait';
    const image = make('img');
    image.decoding = 'async';
    image.className = 'tg-showcase-image';
    image.src = character.portraitLarge;
    image.alt = `${character.name} — портрет`;
    stage.append(image);
    const burst = make('span', null, 'tg-victory-burst');
    burst.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 12; index++) {
      const ray = make('i');
      ray.style.setProperty('--ray', index);
      burst.append(ray);
    }
    stage.append(burst);
    const announcement = make('p', 'Портрет · ожидание', 'tg-art-caption');
    announcement.setAttribute('aria-live', 'polite');
    let state = 'idle', mode = 'portrait';
    const modeButtons = [], moodButtons = [];
    image.addEventListener('load', () => {
      stage.dataset.state = '';
      void stage.offsetWidth;
      stage.dataset.state = state;
    });

    function show(nextState, nextMode) {
      state = nextState;
      mode = nextMode;
      const source = mode === 'portrait' ? character.portraitLarge : character.poses[state];
      image.src = source;
      const label = moods.find(([id]) => id === state)[1];
      image.alt = `${character.name} — ${mode === 'portrait' ? 'портрет' : label.toLowerCase()}`;
      // Restart CSS motion without reloading or modifying game state.
      stage.dataset.state = '';
      void stage.offsetWidth;
      stage.dataset.state = state;
      stage.dataset.mode = mode;
      modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
      moodButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === state)));
      announcement.textContent = `${mode === 'portrait' ? 'Портрет' : 'В полный рост'} · ${label.toLowerCase()}`;
      const modal = stage.closest('dialog');
      if (modal) {
        const top = Math.max(132, (modal.clientHeight - stage.clientHeight) / 2);
        modal.scrollTop += stage.getBoundingClientRect().top - modal.getBoundingClientRect().top - top;
      }
    }

    const views = make('div', null, 'tg-view-controls');
    views.setAttribute('role', 'group');
    views.setAttribute('aria-label', 'Вид изображения');
    for (const [id, text] of [['portrait', 'Портрет'], ['body', 'В полный рост']]) {
      const button = make('button', text);
      button.type = 'button';
      button.dataset.mode = id;
      button.onclick = () => show(id === 'portrait' ? 'idle' : state, id);
      modeButtons.push(button);
      views.append(button);
    }
    const emotions = make('div', null, 'tg-emotion-controls');
    emotions.setAttribute('role', 'group');
    emotions.setAttribute('aria-label', 'Эмоции персонажа');
    for (const [id, text] of moods) {
      const button = make('button', text);
      button.type = 'button';
      button.dataset.state = id;
      button.onclick = () => show(id, 'body');
      moodButtons.push(button);
      emotions.append(button);
    }
    const zoomLabel = make('label', 'Масштаб изображения', 'tg-art-zoom');
    const zoom = make('input');
    zoom.type = 'range'; zoom.min = '100'; zoom.max = '175'; zoom.step = '25'; zoom.value = '100';
    zoom.setAttribute('aria-label', 'Масштаб изображения');
    zoom.oninput = () => stage.style.setProperty('--art-zoom', Number(zoom.value) / 100);
    zoomLabel.append(zoom);
    root.append(stage, announcement, views, emotions, zoomLabel,
      make('p', 'Предпросмотр бесплатный. Доступ к игре с этим персонажем не изменяется.', 'tg-preview-note'));
    show('idle', 'portrait');
    return root;
  }

  window.ManagerPremiumPreview = {create};
})();
