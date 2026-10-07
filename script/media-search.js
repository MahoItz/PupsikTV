// Shared autocomplete for movie and game selection.
window.PupsikMediaSearch = {
  create({ input, button, container, list, search, onSelect, onReset = () => {} }) {
    let items = [];
    let active = -1;
    let version = 0;
    let timer;
    container.classList.add('media-search-results');
    const status = document.createElement('div');
    status.className = 'media-search-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    container.prepend(status);
    input.setAttribute('role', 'combobox');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Результаты поиска');

    function highlight(index) {
      active = index;
      [...list.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
      if (list.children[index]) {
        input.setAttribute('aria-activedescendant', list.children[index].id);
        list.children[index].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }

    function display(state) {
      container.style.display = state === 'idle' ? 'none' : 'block';
      input.setAttribute('aria-expanded', String(state !== 'idle'));
      list.hidden = state !== 'results';
      input.setAttribute('aria-busy', String(state === 'loading'));
      status.hidden = state === 'idle' || state === 'results';
      status.replaceChildren();
      if (state === 'loading') {
        const spinner = document.createElement('span');
        spinner.className = 'loading-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        status.setAttribute('aria-label', 'Поиск');
        status.append(spinner);
      } else {
        status.removeAttribute('aria-label');
        status.textContent = state === 'empty' ? 'Ничего не найдено. Попробуйте другое название.'
          : state === 'error' ? 'Ошибка поиска. Попробуйте ещё раз.' : '';
      }
      highlight(-1);
    }

    function close() {
      clearTimeout(timer);
      version++;
      display('idle');
    }

    function render() {
      list.replaceChildren();
      items.forEach((item, index) => {
        const option = document.createElement('div');
        option.className = 'autocomplete-option';
        option.id = `${list.id}-option-${index}`;
        option.dataset.index = String(index);
        option.setAttribute('role', 'option');
        const poster = document.createElement('img');
        poster.className = 'media-search-poster';
        poster.alt = '';
        poster.loading = 'lazy';
        poster.src = item.posterUrlPreview || item.posterUrl || item.background_image || 'images/placeholder-poster.webp';
        poster.addEventListener('error', () => { poster.src = 'images/placeholder-poster.webp'; }, { once: true });
        const content = document.createElement('span');
        content.className = 'media-search-content';
        const title = document.createElement('span');
        title.className = 'media-search-title';
        title.textContent = item.nameRu || item.name || item.nameEn || 'Без названия';
        const meta = document.createElement('span');
        meta.className = 'media-search-meta';
        const original = item.nameOriginal || item.nameEn || item.originalTitle;
        meta.textContent = [original !== title.textContent ? original : '', item.year || item.released?.split('-')[0]].filter(Boolean).join(' · ');
        content.append(title, meta);
        option.append(poster, content);
        list.append(option);
      });
      display(items.length ? 'results' : 'empty');
    }

    async function run(query = input.value) {
      clearTimeout(timer);
      const request = ++version;
      const value = String(query || '').trim();
      items = [];
      list.replaceChildren();
      onReset();
      if (!value) { display('idle'); return; }
      display('loading');
      try {
        const results = await search(value);
        if (request !== version) return;
        items = results;
        render();
      } catch (error) {
        if (request !== version) return;
        console.error('Media search failed', error);
        display('error');
      }
    }

    function choose(index) {
      const item = items[index];
      if (!item) return;
      const option = list.children[index];
      input.value = item.nameRu || item.name || item.nameEn || '';
      close();
      Promise.resolve(onSelect(item, index, option)).catch(error => console.error('Media selection failed', error));
    }
    input.addEventListener('input', () => {
      close();
      items = [];
      list.replaceChildren();
      onReset();
      if (!input.value.trim()) return;
      display('loading');
      timer = setTimeout(() => run(), 180);
    });
    button?.addEventListener('click', () => run());
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') close();
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (list.hidden || !items.length || container.style.display === 'none') return;
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        highlight(active < 0 ? (direction === 1 ? 0 : items.length - 1) : (active + direction + items.length) % items.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (active >= 0) choose(active); else run();
      }
    });
    list.addEventListener('click', event => {
      const option = event.target.closest('.autocomplete-option');
      if (option) choose(Number(option.dataset.index));
    });
    document.addEventListener('click', event => {
      if (!container.contains(event.target) && event.target !== input && !button?.contains(event.target)) close();
    });
    display('idle');
    return { run, close };
  },
};
