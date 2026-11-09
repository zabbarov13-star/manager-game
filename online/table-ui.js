function renderPanelDice(values = null) {
  document.querySelectorAll('.panel-dice .die').forEach((die, index) => {
    const face = (values ?? [2, 5])[index];
    if (die.getAttribute('aria-label') !== String(face)) renderDice(die, face);
  });
}

function mountChatView({ tab, panel, messages }) {
  const storageKey = 'manager.chat-sound';
  const preference = document.getElementById('chat-sound');
  try { preference.checked = localStorage.getItem(storageKey) !== 'off'; } catch {}
  preference.addEventListener('change', () => {
    try { localStorage.setItem(storageKey, preference.checked ? 'on' : 'off'); } catch {}
  });

  const badge = document.createElement('span');
  badge.className = 'chat-unread';
  badge.hidden = true;
  badge.setAttribute('aria-hidden', 'true');
  tab.append(badge);
  const status = document.createElement('span');
  status.className = 'chat-status';
  status.setAttribute('role', 'status');
  tab.after(status);
  messages.className = 'chat-messages';
  messages.setAttribute('role', 'list');
  messages.setAttribute('aria-label', 'История сообщений');
  messages.tabIndex = 0;
  const timeFormat = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });
  let code, lastMessage, unread = 0, lastTone = -Infinity;

  function updateBadge() {
    const count = unread > 99 ? '99+' : String(unread);
    badge.hidden = !unread;
    badge.textContent = count;
    tab.setAttribute('aria-label', unread ? 'Чат · непрочитанных ' + count : 'Чат');
    status.textContent = unread ? 'Непрочитанных сообщений: ' + count : '';
  }

  function markRead() {
    if (panel.hidden || document.hidden) return;
    if (unread) {
      unread = 0;
      updateBadge();
    }
  }

  tab.addEventListener('click', () => {
    markRead();
    messages.scrollTop = messages.scrollHeight;
  });
  document.addEventListener('visibilitychange', markRead);

  function notify() {
    if (!preference.checked || document.hidden || sound.ctx?.state !== 'running' ||
        !sound.settings?.sfxOn || performance.now() - lastTone < 3500) return;
    lastTone = performance.now();
    const now = sound.ctx.currentTime;
    sound.tone(587.33, now, .15, .055, sound.fx);
    sound.tone(783.99, now + .055, .18, .035, sound.fx);
  }

  function render(room, ownSeat) {
    if (!room) return;
    const history = room.chat ?? [];
    const newest = history.at(-1)?.id;
    const initial = code !== room.code;
    if (!initial && lastMessage === newest) return;
    if (initial) unread = 0;
    const previous = history.findIndex(message => message.id === lastMessage);
    const incoming = initial ? [] : history.slice(previous + 1).filter(message => message.seatId !== ownSeat);
    code = room.code;
    lastMessage = newest;
    if (panel.hidden || document.hidden) unread += incoming.length;
    updateBadge();
    if (incoming.length) notify();

    const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
    messages.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Сообщений пока нет.';
      messages.append(empty);
    }
    for (const message of history) {
      const own = message.seatId === ownSeat;
      const seat = room.seats.find(candidate => candidate.id === message.seatId);
      const row = document.createElement('article');
      row.className = own ? 'chat-message chat-own' : 'chat-message';
      row.setAttribute('role', 'listitem');
      if (seat) {
        const avatar = document.createElement('span');
        avatar.className = 'chat-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.innerHTML = avatarSVG(seat.character, /^#[0-9a-f]{6}$/i.test(seat.color) ? seat.color : undefined);
        row.append(avatar);
      }
      const heading = document.createElement('header');
      const name = document.createElement('strong');
      name.textContent = message.name;
      heading.append(name);
      if (own) {
        const you = document.createElement('span');
        you.textContent = 'Вы';
        heading.append(you);
      }
      const timestamp = new Date(message.time);
      if (Number.isFinite(timestamp.getTime())) {
        const time = document.createElement('time');
        time.dateTime = timestamp.toISOString();
        time.textContent = timeFormat.format(timestamp);
        heading.append(time);
      }
      const text = document.createElement('p');
      text.textContent = message.text;
      row.append(heading, text);
      messages.append(row);
    }
    if (initial || nearBottom || history.at(-1)?.seatId === ownSeat) messages.scrollTop = messages.scrollHeight;
  }

  return { render, reset() {
    code = lastMessage = undefined;
    unread = 0;
    lastTone = -Infinity;
    messages.replaceChildren();
    updateBadge();
  } };
}
