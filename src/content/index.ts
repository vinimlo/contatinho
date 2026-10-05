import { createCollector, viewerPkFromCookie } from '../lib/collect';
import { getCooldown, loadAccount, loadThumbs, saveReading, saveThumbs, setCooldown } from '../lib/storage';
import { encodeThumb } from './thumb';
import type { RuntimeMessage } from '../lib/types';

function broadcast(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Painel fechado: ninguém escutando. A leitura fica no storage.
  });
}

const collector = createCollector({
  fetch: window.fetch.bind(window),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
  now: Date.now,
  cookie: () => document.cookie,
  saveReading,
  cooldownUntil: getCooldown,
  setCooldown,
  progress: broadcast,
  done: (result) => broadcast({ type: 'done', result }),
  thumbs: {
    load: loadThumbs,
    save: saveThumbs,
    specials: async (viewerPk) => (await loadAccount(viewerPk)).specials,
    encode: (blob) => encodeThumb(blob),
    progress: (done, total) => broadcast({ type: 'photos', done, total }),
  },
});

chrome.runtime.onMessage.addListener((message: { type?: string } | undefined, _sender, sendResponse) => {
  if (message?.type === 'whoami') {
    sendResponse({ viewerPk: viewerPkFromCookie(document.cookie), running: collector.isRunning() });
    return false;
  }
  if (message?.type === 'collect') {
    void collector.start().then(sendResponse);
    return true;
  }
  return false;
});
