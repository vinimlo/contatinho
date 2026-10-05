<script lang="ts">
  import type { Profile } from '../lib/types';
  import { PENCIL } from './pencil';

  interface Props {
    profile: Profile;
    /** Miniatura guardada (data URL); tem prioridade sobre a URL do Instagram. */
    thumb?: string;
    starred: boolean;
    /** Número do quadro: a posição desta conta na tira. */
    frame?: number;
    seen?: boolean;
    /** O círculo de lápis está sendo traçado (a conta está virando especial). */
    marking?: boolean;
    disabled?: boolean;
    note?: string;
    onopen: () => void;
    onstar: () => void;
  }

  let { profile, thumb, starred, frame, seen = false, marking = false, disabled = false, note = '', onopen, onstar }: Props = $props();

  let broken = $state(false);
  const src = $derived(thumb || profile.picUrl);

  // Por grafema, só de palavras que começam com letra ou número: emoji nunca vira meio caractere.
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  function initialsOf(text: string): string {
    return text
      .split(/[\s._]+/)
      .map((word) => graphemes.segment(word)[Symbol.iterator]().next().value?.segment ?? '')
      .filter((first) => /^[\p{L}\p{N}]/u.test(first))
      .slice(0, 2)
      .map((first) => first.toUpperCase())
      .join('');
  }
  const initials = $derived(initialsOf(profile.fullName) || initialsOf(profile.username) || '?');
  const label = $derived(
    [
      `Abrir perfil de @${profile.username}`,
      profile.fullName,
      profile.isVerified ? 'verificado' : '',
      profile.isPrivate ? 'privado' : '',
      note,
    ]
      .filter(Boolean)
      .join(', '),
  );
</script>

<li class="row" class:seen>
  <span class="frame" aria-hidden="true">
    {frame ?? ''}
    {#if seen}
      <svg class="slash" viewBox="0 0 24 22"><path d={PENCIL.slash} /></svg>
    {/if}
  </span>
  <button class="open" type="button" {disabled} aria-label={label} onclick={onopen}>
    <span class="photo">
      {#if src && !broken}
        <img class="avatar" {src} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={() => (broken = true)} />
      {:else}
        <span class="avatar initials" aria-hidden="true">{initials}</span>
      {/if}
      {#if starred || marking}
        <svg class="circle" class:drawing={marking} viewBox="0 0 62 62" aria-hidden="true">
          <path d={PENCIL.circle} pathLength="1" />
        </svg>
      {/if}
    </span>
    <span class="who">
      <span class="handle">@{profile.username}</span>
      {#if profile.fullName || profile.isVerified || profile.isPrivate}
        <span class="name">
          {profile.fullName}
          {#if profile.isVerified}<span class="badge" title="Verificado">✔</span>{/if}
          {#if profile.isPrivate}<span class="badge" title="Privado">🔒</span>{/if}
        </span>
      {/if}
      {#if note}<span class="note">{note}</span>{/if}
    </span>
  </button>
  <button
    class="star"
    type="button"
    aria-pressed={starred}
    aria-label={starred ? `Tirar @${profile.username} das especiais` : `Marcar @${profile.username} como especial`}
    onclick={onstar}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PENCIL.star} /></svg>
  </button>
</li>

<style lang="scss">
  .row {
    position: relative;
    display: grid;
    grid-template-columns: var(--rail) minmax(0, 1fr) 44px;
    align-items: center;
    min-height: 64px;
    padding-right: 6px;

    &:not(:first-child)::before {
      content: '';
      position: absolute;
      top: 0;
      left: calc(var(--rail) + 12px);
      right: 0;
      border-top: 1px solid var(--line);
    }
  }

  .frame {
    position: relative;
    justify-self: end;
    margin-right: 7px;
    font-family: var(--font-frame);
    font-weight: 700;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--amber);
  }

  .slash {
    position: absolute;
    left: -6px;
    top: -2px;
    width: 26px;
    height: 22px;
    overflow: visible;

    path {
      fill: none;
      stroke: var(--pencil);
      stroke-width: 2.2;
      stroke-linecap: round;
    }
  }

  .open {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 10px 4px 10px 12px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:disabled {
      cursor: progress;
    }

    &:focus-visible {
      outline: 2px solid var(--pencil);
      outline-offset: -2px;
      border-radius: 4px;
    }
  }

  .photo {
    position: relative;
    flex: none;
    width: 44px;
    height: 44px;
  }

  .avatar {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
    object-fit: cover;
    background: var(--line);
    filter: grayscale(1) contrast(1.05);
    transition: filter 0.18s ease-out;
  }

  // Revela a cor ao passar o mouse ou focar, como uma prova que sai do revelador.
  .row:hover .avatar,
  .open:focus-visible .avatar {
    filter: none;
  }

  .initials {
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 14px;
    color: var(--muted);
  }

  .circle {
    position: absolute;
    left: -9px;
    top: -9px;
    width: 62px;
    height: 62px;
    overflow: visible;
    pointer-events: none;

    path {
      fill: none;
      stroke: var(--pencil);
      stroke-width: 2.6;
      stroke-linecap: round;
    }

    &.drawing path {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: draw 0.4s ease-out forwards;
    }
  }

  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .circle.drawing path {
      animation: none;
      stroke-dashoffset: 0;
    }

    .avatar {
      transition: none;
    }
  }

  .who {
    display: grid;
    min-width: 0;
  }

  .handle {
    overflow: hidden;
    font-weight: 600;
    font-size: 15px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name,
  .note {
    overflow: hidden;
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .note {
    font-style: italic;
  }

  .badge {
    margin-left: 3px;
  }

  .seen .who,
  .seen .avatar {
    opacity: 0.5;
  }

  .star {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--muted);
    cursor: pointer;

    svg {
      width: 22px;
      height: 22px;
    }

    path {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linejoin: round;
    }

    &:hover,
    &:focus-visible {
      background: var(--hover);
      color: var(--pencil);
    }

    &:focus-visible {
      outline: 2px solid var(--pencil);
      outline-offset: 1px;
    }

    &[aria-pressed='true'] {
      color: var(--pencil);

      path {
        fill: currentColor;
        fill-opacity: 0.2;
      }
    }
  }
</style>
