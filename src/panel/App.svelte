<script lang="ts">
  import { onMount } from 'svelte';
  import Row from './Row.svelte';
  import { matchesQuery, nonFollowers, specialsView, splitVerified } from '../lib/core';
  import { buildSpecialsFile, parseSpecialsFile, specialsFileName } from '../lib/specialsFile';
  import * as storage from '../lib/storage';
  import type { AccountData } from '../lib/storage';
  import type { CollectResult, ErrorCode, PhotosMessage, Profile, ProgressMessage } from '../lib/types';
  import { activeTab, isInstagramUrl, openInstagram, openProfile, openProfileInNewTab, requestCollect, whoami } from './client';
  import { countLabel, errorMessage, formatCount, formatCountdown, relativeTime } from './messages';
  import { PENCIL } from './pencil';

  let { pollMs = 5000, graceMs = 1500 }: { pollMs?: number; graceMs?: number } = $props();

  type Progress = Omit<ProgressMessage, 'type'>;

  /** Tempo do traço do círculo de lápis antes de a conta ir para Especiais. */
  const MARK_MS = 420;

  let tabId = $state<number | null>(null);
  let onInstagram = $state(false);
  let viewerPk = $state<string | null>(null);
  let data = $state.raw<AccountData | null>(null);
  let progress = $state<Progress | null>(null);
  let banner = $state<{ code: ErrorCode; detail?: string } | null>(null);
  let notice = $state<string | null>(null);
  let undo = $state<{ profile: Profile; starredAt: number } | null>(null);
  let marking = $state<string | null>(null);
  let photos = $state<{ done: number; total: number } | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let view = $state<'non' | 'specials'>('non');
  let query = $state('');
  let now = $state(Date.now());

  const nonAll = $derived(data?.reading ? nonFollowers(data.reading, data.specials) : []);
  // Duas tiras: quem não é verificado primeiro, verificados no fim. O número do quadro é a posição na
  // própria tira, contado antes da busca, para não mudar enquanto você filtra.
  const groups = $derived(splitVerified(nonAll));
  const regularList = $derived(groups.regular.filter((p) => matchesQuery(p, query)));
  const verifiedList = $derived(groups.verified.filter((p) => matchesQuery(p, query)));
  const specialAll = $derived(data ? specialsView(data.reading, data.specials) : []);
  const specialRows = $derived(specialAll.filter((p) => matchesQuery(p, query)));
  const frameOf = $derived(
    new Map<string, number>([
      ...groups.regular.map((p, i) => [p.pk, i + 1] as const),
      ...groups.verified.map((p, i) => [p.pk, i + 1] as const),
    ]),
  );
  const specialFrameOf = $derived(new Map(specialAll.map((p, i) => [p.pk, i + 1] as const)));
  const specialTotal = $derived(data ? Object.keys(data.specials).length : 0);
  const seenSet = $derived(new Set(data?.seen ?? []));
  const seenCount = $derived(nonAll.filter((p) => seenSet.has(p.pk)).length);
  const cooldownLeft = $derived(Math.max(0, (data?.cooldownUntil ?? 0) - now));
  const canRead = $derived(onInstagram && tabId !== null && progress === null && cooldownLeft === 0);

  async function load(): Promise<void> {
    data = viewerPk ? await storage.loadAccount(viewerPk) : null;
  }

  async function init(): Promise<void> {
    const tab = await activeTab();
    tabId = tab?.id ?? null;
    onInstagram = isInstagramUrl(tab?.url);
    banner = null;
    let pk: string | null = null;
    if (!onInstagram) {
      banner = { code: 'not-instagram' };
    } else if (tabId !== null) {
      const who = await whoami(tabId);
      if (!who) {
        banner = { code: 'no-content-script' };
      } else {
        pk = who.viewerPk;
        if (!pk) banner = { code: 'not-logged-in' };
        if (who.running && progress === null) progress = { phase: 'following', read: 0 };
      }
    }
    viewerPk = pk ?? (await storage.getLastViewerPk());
    await load();
  }

  async function readNow(): Promise<void> {
    if (!canRead || tabId === null) return;
    banner = null;
    notice = null;
    const result = await requestCollect(tabId);
    if (result.ok) progress = { phase: 'following', read: 0 };
    else banner = { code: result.code };
  }

  async function checkAlive(): Promise<void> {
    if (progress === null || tabId === null) return;
    const who = await whoami(tabId);
    if (who?.running) return;
    await new Promise((resolve) => setTimeout(resolve, graceMs));
    if (progress !== null) {
      progress = null;
      // A aba pode ter sido fechada: reencontra a aba ativa antes de avisar.
      await init();
      banner = { code: 'interrupted' };
    }
  }

  function onRuntimeMessage(message: unknown, sender: chrome.runtime.MessageSender): void {
    if (sender.tab?.id !== tabId) return;
    const m = message as { type?: string };
    if (m?.type === 'progress') {
      const { phase, read, waitingSeconds } = message as ProgressMessage;
      progress = { phase, read, waitingSeconds };
    } else if (m?.type === 'photos') {
      const { done, total } = message as PhotosMessage;
      photos = done < total ? { done, total } : null;
    } else if (m?.type === 'done') {
      const result = (message as { result: CollectResult }).result;
      progress = null;
      // Durante a leitura o painel ignora troca de aba; no fim, volta a seguir a aba ativa.
      void init().then(() => {
        if (!result.ok) banner = { code: result.code, detail: result.detail };
      });
    }
  }

  function onStorageChanged(changes: Record<string, unknown>, area: string): void {
    if (area !== 'local' || !viewerPk) return;
    if (Object.keys(changes).some((key) => key.startsWith(`accounts.${viewerPk}.`))) void load();
  }

  async function open(profile: Pick<Profile, 'pk' | 'username'>): Promise<void> {
    if (progress !== null) return;
    try {
      if (onInstagram && tabId !== null) await openProfile(tabId, profile.username);
      else await openProfileInNewTab(profile.username);
    } catch {
      // Aba fechada por fora: reencontra a aba ativa; o próximo clique já vai para ela.
      await init();
      return;
    }
    if (viewerPk) await storage.markSeen(viewerPk, profile.pk);
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  async function star(profile: Profile): Promise<void> {
    if (!viewerPk || marking === profile.pk) return;
    const previous = data?.specials[profile.pk];
    if (!previous && !prefersReducedMotion()) {
      // O círculo de lápis se traça em volta da foto e só então a conta vai para Especiais.
      marking = profile.pk;
      await new Promise((resolve) => setTimeout(resolve, MARK_MS));
    }
    const starred = await storage.toggleSpecial(viewerPk, profile, Date.now());
    if (marking === profile.pk) marking = null;
    // Uma especial que segue de volta não reaparece em lista nenhuma: sem desfazer, só importando.
    undo = !starred && previous ? { profile: { ...profile }, starredAt: previous.starredAt } : null;
  }

  async function undoUnstar(): Promise<void> {
    if (!viewerPk || !undo) return;
    const { profile, starredAt } = undo;
    undo = null;
    await storage.toggleSpecial(viewerPk, profile, starredAt);
  }

  function exportSpecials(): void {
    if (!viewerPk || !data) return;
    const username = data.reading?.username ?? viewerPk;
    const file = buildSpecialsFile({ pk: viewerPk, username }, data.specials);
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = specialsFileName(username, new Date());
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !viewerPk) return;
    try {
      const parsed = parseSpecialsFile(await file.text());
      const { added, existing } = await storage.importSpecials(viewerPk, parsed);
      const from = parsed.account.pk !== viewerPk ? ` (exportadas de @${parsed.account.username})` : '';
      notice = `${countLabel(added, 'nova', 'novas')}, ${existing} ${existing === 1 ? 'já estava' : 'já estavam'}${from}.`;
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Arquivo inválido.';
    }
  }

  onMount(() => {
    const onActivated = () => {
      if (progress === null) void init();
    };
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && progress === null && info.status === 'complete') void init();
    };
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    const tick = setInterval(() => (now = Date.now()), 1000);
    const poll = setInterval(() => void checkAlive(), pollMs);
    void init();
    return () => {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearInterval(tick);
      clearInterval(poll);
    };
  });
</script>

{#snippet underline()}
  <svg class="underline" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
    <path d={PENCIL.underline} vector-effect="non-scaling-stroke" />
  </svg>
{/snippet}

<main class="panel">
  <header class="top">
    <div class="brand">
      <h1>Contatinho</h1>
      {#if data?.reading}<span class="account">@{data.reading.username}</span>{/if}
    </div>
    <button class="read" type="button" disabled={!canRead} onclick={readNow}>
      {#if progress}Lendo…{:else if cooldownLeft > 0}Ler de novo em {formatCountdown(cooldownLeft)}{:else}Ler agora{/if}
    </button>
    {#if progress}
      <p class="status" role="status">
        {progress.phase === 'following' ? 'Lendo seguindo' : 'Lendo seguidores'}: {formatCount(progress.read)}
        {#if progress.waitingSeconds}. O Instagram pediu pausa; a leitura volta em {progress.waitingSeconds} s.{/if}
      </p>
    {:else if data?.reading}
      <p class="status">
        Lido {relativeTime(data.reading.at, now)}: {formatCount(data.reading.following.length)} seguindo e
        {countLabel(data.reading.followerPks.length, 'seguidor', 'seguidores')}.
      </p>
    {/if}
    {#if photos}
      <p class="status" role="status">Baixando fotos: {formatCount(photos.done)} de {formatCount(photos.total)}.</p>
    {/if}
  </header>

  {#if banner}
    <div class="banner" role="alert">
      <p>{errorMessage(banner.code, banner.detail)}</p>
      {#if banner.code === 'not-instagram'}
        <button type="button" onclick={() => openInstagram()}>Abrir o instagram.com</button>
      {/if}
      {#if banner.detail && banner.code !== 'incomplete'}
        <details>
          <summary>Detalhe técnico</summary>
          <code>{banner.detail}</code>
        </details>
      {/if}
    </div>
  {/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if undo}
    <p class="notice" role="status">
      Tirou @{undo.profile.username} das especiais.
      <button type="button" class="undo" onclick={undoUnstar}>Desfazer</button>
    </p>
  {/if}

  <div class="tabs" role="tablist">
    <button
      type="button"
      class="tab"
      role="tab"
      id="tab-non"
      aria-controls="tab-panel"
      aria-selected={view === 'non'}
      onclick={() => (view = 'non')}
    >
      Não te seguem <span class="count">{formatCount(nonAll.length)}</span>
      {#if view === 'non'}{@render underline()}{/if}
    </button>
    <button
      type="button"
      class="tab"
      role="tab"
      id="tab-specials"
      aria-controls="tab-panel"
      aria-selected={view === 'specials'}
      onclick={() => (view = 'specials')}
    >
      Especiais <span class="count">{formatCount(specialTotal)}</span>
      {#if view === 'specials'}{@render underline()}{/if}
    </button>
  </div>

  <div class="tools">
    <input type="search" placeholder="Buscar por @ ou nome" aria-label="Buscar" bind:value={query} />
    {#if view === 'non' && seenCount > 0}<span class="seen-count">{countLabel(seenCount, 'vista', 'vistas')}</span>{/if}
  </div>

  <div class="tab-panel" role="tabpanel" id="tab-panel" aria-labelledby={view === 'non' ? 'tab-non' : 'tab-specials'}>
    {#if view === 'non'}
      {#if !data?.reading}
        <p class="empty">Nenhuma leitura ainda. Abra o instagram.com e clique em “Ler agora”.</p>
      {:else if regularList.length + verifiedList.length === 0}
        <p class="empty">{query ? 'Nada encontrado.' : 'Todo mundo que você segue te segue de volta.'}</p>
      {:else}
        {#if regularList.length > 0}
          <ol class="strip">
            {#each regularList as profile (profile.pk)}
              <Row
                {profile}
                thumb={data?.thumbs[profile.pk]?.data}
                frame={frameOf.get(profile.pk)}
                starred={false}
                marking={marking === profile.pk}
                seen={seenSet.has(profile.pk)}
                disabled={progress !== null}
                onopen={() => open(profile)}
                onstar={() => star(profile)}
              />
            {/each}
          </ol>
        {/if}
        {#if verifiedList.length > 0}
          <h2 class="group">Verificados <span class="count">{formatCount(groups.verified.length)}</span></h2>
          <ol class="strip">
            {#each verifiedList as profile (profile.pk)}
              <Row
                {profile}
                thumb={data?.thumbs[profile.pk]?.data}
                frame={frameOf.get(profile.pk)}
                starred={false}
                marking={marking === profile.pk}
                seen={seenSet.has(profile.pk)}
                disabled={progress !== null}
                onopen={() => open(profile)}
                onstar={() => star(profile)}
              />
            {/each}
          </ol>
        {/if}
      {/if}
    {:else}
      {#if specialRows.length === 0}
        <p class="empty">{query ? 'Nada encontrado.' : 'Nenhuma conta especial. Use a estrela da lista para marcar.'}</p>
      {:else}
        <ol class="strip">
          {#each specialRows as profile (profile.pk)}
            <Row
              {profile}
              thumb={data?.thumbs[profile.pk]?.data}
              frame={specialFrameOf.get(profile.pk)}
              starred={true}
              disabled={progress !== null}
              note={profile.outsideFollowing ? 'fora de seguindo' : ''}
              onopen={() => open(profile)}
              onstar={() => star(profile)}
            />
          {/each}
        </ol>
      {/if}
      <footer class="files">
        <button type="button" disabled={!viewerPk} onclick={exportSpecials}>Exportar</button>
        <button type="button" disabled={!viewerPk} onclick={() => fileInput?.click()}>Importar</button>
        <input bind:this={fileInput} type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" onchange={importFile} />
      </footer>
    {/if}
  </div>
</main>

<style lang="scss">
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    gap: 12px;
    padding: 18px 18px 14px;
    background: var(--paper);
  }

  .brand {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;

    h1 {
      margin: 0;
      font-size: 23px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
  }

  .account {
    overflow: hidden;
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .read {
    padding: 11px 16px;
    border: 0;
    border-radius: 6px;
    background: var(--action);
    color: var(--on-action);
    font: inherit;
    font-weight: 700;
    cursor: pointer;

    &:disabled {
      background: var(--line);
      color: var(--muted);
      cursor: not-allowed;
    }

    &:focus-visible {
      outline: 2px solid var(--pencil);
      outline-offset: 2px;
    }
  }

  // Sem tabular-nums: nesta fonte ele alarga também o ponto e os dois-pontos.
  .status {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  .banner {
    margin: 0 18px 12px;
    padding: 10px 12px;
    border-left: 3px solid var(--pencil);
    border-radius: 0 6px 6px 0;
    background: var(--note);
    font-size: 14px;

    p {
      margin: 0;
    }

    button {
      margin-top: 8px;
      padding: 6px 12px;
      border: 1px solid currentColor;
      border-radius: 6px;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    details {
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
    }
  }

  .notice {
    margin: 0 18px 12px;
    font-size: 13px;
    color: var(--muted);
  }

  .undo {
    margin-left: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--pencil);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .tabs {
    display: flex;
    gap: 22px;
    padding: 0 18px;
    border-bottom: 1px solid var(--line);
  }

  .tab {
    position: relative;
    padding: 10px 0 12px;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;

    &[aria-selected='true'] {
      color: var(--ink);
      font-weight: 600;
    }

    &:focus-visible {
      outline: 2px solid var(--pencil);
      outline-offset: 2px;
      border-radius: 4px;
    }
  }

  .count {
    margin-left: 3px;
    font-family: var(--font-frame);
    font-weight: 700;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }

  .underline {
    position: absolute;
    left: -4px;
    bottom: -4px;
    width: calc(100% + 8px);
    height: 10px;

    path {
      fill: none;
      stroke: var(--pencil);
      stroke-width: 2.4;
      stroke-linecap: round;
    }
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;

    input {
      flex: 1;
      min-width: 0;
      padding: 9px 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 14px;

      &::placeholder {
        color: var(--muted);
      }

      &:focus-visible {
        outline: 2px solid var(--pencil);
        outline-offset: 1px;
      }
    }
  }

  .seen-count {
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
  }

  .tab-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  // A tira de filme: base escura com perfurações vazadas (a máscara deixa o papel aparecer).
  .strip {
    position: relative;
    margin: 0;
    padding: 0;
    list-style: none;

    &::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: var(--rail);
      background: var(--film);
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='16'%3E%3Cpath fill-rule='evenodd' d='M0 0H46V16H0Z M8.6 5H13.4A1.6 1.6 0 0 1 15 6.6V9.4A1.6 1.6 0 0 1 13.4 11H8.6A1.6 1.6 0 0 1 7 9.4V6.6A1.6 1.6 0 0 1 8.6 5Z'/%3E%3C/svg%3E") 0 0 / 46px 16px repeat-y;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='16'%3E%3Cpath fill-rule='evenodd' d='M0 0H46V16H0Z M8.6 5H13.4A1.6 1.6 0 0 1 15 6.6V9.4A1.6 1.6 0 0 1 13.4 11H8.6A1.6 1.6 0 0 1 7 9.4V6.6A1.6 1.6 0 0 1 8.6 5Z'/%3E%3C/svg%3E") 0 0 / 46px 16px repeat-y;
    }
  }

  // Entre as tiras o papel aparece, como no corte entre dois rolos.
  .group {
    margin: 22px 18px 8px calc(var(--rail) + 12px);
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
  }

  .empty {
    flex: 1;
    margin: 0;
    padding: 40px 24px;
    color: var(--muted);
    text-align: center;
  }

  .files {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    gap: 10px;
    margin-top: auto;
    padding: 12px 18px;
    background: var(--paper);
    border-top: 1px solid var(--line);

    button {
      flex: 1;
      padding: 9px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;

      &:disabled {
        color: var(--muted);
        cursor: not-allowed;
      }

      &:focus-visible {
        outline: 2px solid var(--pencil);
        outline-offset: 1px;
      }
    }

    input {
      display: none;
    }
  }
</style>
