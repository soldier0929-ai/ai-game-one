import type { GameViewModel, Screen, UIAction } from './types';

const icons = {
  sound: '<path d="M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 4 6 8H3v8h3l5 4V4Zm5 5 5 6m0-6-5 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
};
function icon(name: keyof typeof icons): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}
function button(action: UIAction['type'], text: string, css = '', glyph?: keyof typeof icons): string {
  return `<button type="button" class="game-button ${css}" data-action="${action}">${text}${glyph ? icon(glyph) : ''}</button>`;
}
function stars(value: number): string { const n = Math.max(0, Math.min(3, Math.floor(value))); return '★'.repeat(n) + '☆'.repeat(3 - n); }

/** Owns only the DOM inside the overlay. Canvas input stays with the game. */
export class GameUI {
  private screen: Screen | null = null;
  private disposed = false;
  private readonly fields = new Map<string, HTMLElement[]>();
  private readonly content: HTMLElement;
  private readonly mute: HTMLButtonElement;
  private readonly pause: HTMLButtonElement;
  private readonly help: HTMLButtonElement;
  private readonly hud: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly warning: HTMLElement;
  private readonly onClick = (event: MouseEvent): void => {
    if (this.disposed || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLButtonElement>('button[data-action],button[data-level]');
    if (!target || !this.root.contains(target) || target.disabled) return;
    if (target.dataset.level) this.onAction({ type: 'level', id: Number(target.dataset.level) });
    else this.onAction({ type: target.dataset.action } as UIAction);
  };

  constructor(private readonly root: HTMLElement, private readonly onAction: (action: UIAction) => void) {
    root.classList.add('game-ui');
    root.innerHTML = `<header class="game-header"><div class="game-brand" aria-label="潮汐拆塔队 Tidal Tower"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M9 20V10h8v10m3 0V5h8v15" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M3 24q4-5 8 0t8 0 8 0 7 0M3 30q4-5 8 0t8 0 8 0 7 0" stroke="currentColor" stroke-width="2.5"/></svg></span><span>潮汐拆塔队<small>TIDAL TOWER</small></span></div><nav class="header-controls" aria-label="游戏控制">${button('help', icon('help'), 'icon-button')}${button('mute', icon('sound'), 'icon-button')}${button('pause', icon('pause'), 'icon-button')}</nav></header><section class="game-hud" aria-label="当前关卡"><div class="hud-level"><span class="eyebrow" data-field="level-number"></span><strong data-field="level-name"></strong></div><div class="hud-score"><span class="hud-label">落水方块</span><strong><span data-field="fallen"></span><span class="hud-divider"> / </span><span data-field="target"></span></strong><div class="score-track"><span data-field="score-bar"></span></div></div><div class="hud-ammo"><span class="hud-label">剩余炮弹</span><strong data-field="ammo"></strong><span class="ammo-dots" data-field="ammo-dots" aria-hidden="true"></span></div></section><main class="screen-content"></main><footer class="game-footer"><div class="aim-prompt"><span class="prompt-dot" aria-hidden="true"></span><strong data-field="aim-prompt"></strong></div><span class="level-hint" data-field="level-hint"></span><span class="key-hint">ESC 暂停</span></footer><p class="storage-warning" role="status" hidden>浏览器未能保存进度，本次游戏仍可继续。</p>`;
    this.content = root.querySelector('.screen-content')!;
    this.mute = root.querySelector('[data-action="mute"]')!;
    this.pause = root.querySelector('[data-action="pause"]')!;
    this.help = root.querySelector('[data-action="help"]')!;
    this.hud = root.querySelector('.game-hud')!;
    this.footer = root.querySelector('.game-footer')!;
    this.warning = root.querySelector('.storage-warning')!;
    this.help.setAttribute('aria-label', '玩法说明'); this.pause.setAttribute('aria-label', '暂停游戏');
    root.addEventListener('click', this.onClick);
  }

  render(model: GameViewModel): void {
    if (this.disposed) return;
    if (this.screen !== model.screen) {
      this.screen = model.screen;
      this.root.dataset.screen = model.screen;
      this.content.innerHTML = this.screenMarkup(model.screen);
      this.fields.clear();
      this.content.querySelector('[data-action="back"]')?.setAttribute('aria-label', '返回');
      this.root.querySelectorAll<HTMLElement>('[data-field]').forEach(el => {
        const key = el.dataset.field!; this.fields.set(key, [...(this.fields.get(key) ?? []), el]);
      });
    }
    const inGame = ['playing', 'paused', 'won', 'lost'].includes(model.screen);
    this.hud.hidden = !inGame;
    this.pause.hidden = model.screen !== 'playing';
    this.help.hidden = ['loading', 'error', 'tutorial'].includes(model.screen);
    this.footer.hidden = model.screen !== 'playing';
    this.warning.hidden = !model.storageWarning;
    const muteLabel = model.muted ? '开启声音' : '关闭声音';
    if (this.mute.getAttribute('aria-label') !== muteLabel) {
      this.mute.setAttribute('aria-label', muteLabel); this.mute.title = muteLabel;
      this.mute.setAttribute('aria-pressed', String(model.muted));
      this.mute.innerHTML = icon(model.muted ? 'mute' : 'sound');
    }
    this.set('level-number', `第 ${String(model.currentLevel).padStart(2, '0')} 关 / 08`);
    this.set('level-name', model.levelName);
    this.set('fallen', String(model.fallen)); this.set('target', String(model.target)); this.set('ammo', String(model.ammo));
    this.set('ammo-dots', '●'.repeat(Math.max(0, model.ammo)) + '○'.repeat(Math.max(0, model.maxAmmo - model.ammo)));
    this.set('level-hint', model.levelHint);
    this.set('aim-prompt', model.phase === 'settling' ? '等待高塔落定…' : model.dragging ? '松开发射' : '拖动瞄准 · 松开发射');
    this.set('home-level', `第 ${String(model.currentLevel).padStart(2, '0')} 关 · ${model.levelName}`);
    this.set('home-target', `让至少 ${model.target} / ${model.total} 块方块落入海中`);
    this.set('result-stars', stars(model.stars));
    this.fields.get('result-stars')?.forEach(el => el.setAttribute('aria-label', `本次获得 ${model.stars} 星`));
    this.set('result-score', `${model.fallen} / ${model.total}`);
    this.set('result-target', `通关目标 ${model.target} 块`);
    this.set('best-stars', stars(model.bestStars[model.currentLevel - 1] ?? 0));
    this.set('error', model.error || '游戏暂时无法加载，请重试。');
    this.fields.get('score-bar')?.forEach(el => {
      const width = `${Math.min(100, model.fallen / Math.max(1, model.target) * 100)}%`;
      if (el.style.width !== width) el.style.width = width;
    });
    if (model.screen === 'levels') {
      this.root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(el => {
        const id = Number(el.dataset.level); const locked = id > model.unlocked;
        el.disabled = locked; el.classList.toggle('current', id === model.currentLevel);
        const record = el.querySelector<HTMLElement>('.level-stars')!;
        const label = locked ? '未解锁' : stars(model.bestStars[id - 1] ?? 0);
        if (record.textContent !== label) record.textContent = label;
        el.setAttribute('aria-label', `第 ${id} 关，${locked ? '未解锁' : `最佳 ${model.bestStars[id - 1] ?? 0} 星`}`);
      });
    }
    const next = this.root.querySelector<HTMLButtonElement>('[data-action="next"]');
    if (next) { next.hidden = model.currentLevel >= 8; next.disabled = model.currentLevel >= 8; }
    this.set('won-title', model.currentLevel >= 8 ? '八座高塔，全部拿下！' : '高塔已入海！');
  }

  private set(key: string, value: string): void {
    this.fields.get(key)?.forEach(el => { if (el.textContent !== value) el.textContent = value; });
  }

  private screenMarkup(screen: Screen): string {
    if (screen === 'playing') return '';
    if (screen === 'home') return `<section class="home-panel"><p class="eyebrow">物理拆塔挑战</p><h1>潮汐<br><span>拆塔队</span></h1><p class="home-description">找准支点，掀起连锁倒塌。<br>用有限的炮弹，拆掉海上的高塔。</p><div class="home-level"><span class="small-tag">准备开炮</span><strong data-field="home-level"></strong><span data-field="home-target"></span></div>${button('start', '开始游戏', 'primary large', 'arrow')}<div class="home-secondary">${button('levels', '选择关卡', 'secondary')}${button('help', '怎么玩', 'text-button')}</div><p class="home-controls">鼠标 / 触屏拖动瞄准，松开发射</p></section><div class="world-label" aria-hidden="true"><span>海上试炼场</span><strong>08 座高塔 · 真实物理</strong></div>`;
    if (screen === 'levels') return `<section class="game-panel levels-panel"><div class="panel-top"><div><p class="eyebrow">海上试炼</p><h2>选择关卡</h2></div>${button('back', icon('back'), 'icon-button panel-back')}</div><p class="panel-copy">逐关拆塔，收集你的三星战绩。</p><div class="level-grid">${Array.from({ length: 8 }, (_, i) => `<button type="button" class="level-card" data-level="${i + 1}"><span class="level-index">${String(i + 1).padStart(2, '0')}</span><span class="level-card-name">第 ${i + 1} 关</span><span class="level-stars"></span></button>`).join('')}</div><p class="panel-note">通关后解锁下一座高塔</p></section>`;
    if (screen === 'tutorial') return `<section class="game-panel tutorial-panel"><p class="eyebrow">开炮前，了解三件事</p><h2>瞄准。松手。<span>看它倒下。</span></h2><ol class="tutorial-steps"><li><span>01</span><div><strong>拖动瞄准</strong><p>在场景中按住鼠标或手指，调整炮口。瞄准线会显示弹道。</p></div></li><li><span>02</span><div><strong>松开发射</strong><p>每次松手消耗一枚炮弹。击中底层支点，更容易带动整座塔。</p></div></li><li><span>03</span><div><strong>让方块落水</strong><p>至少让 80% 的方块落入海中即可通关。用更少的炮弹，争取更多星星。</p></div></li></ol>${button('tutorial-done', '明白了，开始瞄准', 'primary', 'arrow')}<p class="panel-note">方向键调整瞄准 · 空格发射 · ESC 暂停</p></section>`;
    if (screen === 'paused') return `<section class="game-panel compact-panel"><span class="panel-symbol" aria-hidden="true">Ⅱ</span><p class="eyebrow">先歇一会儿</p><h2>游戏已暂停</h2><p class="panel-copy">高塔和炮弹都在等你。</p><div class="panel-actions">${button('resume', '继续游戏', 'primary', 'arrow')}${button('restart', '重新挑战', 'secondary')}${button('levels', '选择关卡', 'text-button')}</div></section>`;
    if (screen === 'won' || screen === 'lost') return `<section class="game-panel compact-panel result-panel"><p class="eyebrow">${screen === 'won' ? '挑战成功' : '炮弹已用尽'}</p><h2 ${screen === 'won' ? 'data-field="won-title"' : ''}>${screen === 'won' ? '高塔已入海！' : '再找一个突破口'}</h2>${screen === 'won' ? '<div class="result-stars" data-field="result-stars" aria-label="本次星级"></div>' : '<p class="panel-copy">试试瞄准底层，让整座塔一起失去平衡。</p>'}<div class="result-stat"><span>落水方块</span><strong data-field="result-score"></strong><small data-field="result-target"></small></div><p class="record-line">最佳战绩 <span data-field="best-stars"></span></p><div class="panel-actions">${screen === 'won' ? button('next', '下一关', 'primary', 'arrow') : ''}${button('restart', '再挑战一次', screen === 'lost' ? 'primary' : 'secondary')}${button('levels', '选择关卡', 'text-button')}</div></section>`;
    if (screen === 'error') return `<section class="game-panel compact-panel"><p class="eyebrow">加载遇到问题</p><h2>游戏加载失败</h2><p class="panel-copy error-copy" data-field="error"></p>${button('retry', '重新加载', 'primary', 'arrow')}</section>`;
    return `<section class="loading-panel" role="status"><span class="loading-spinner" aria-hidden="true"></span><strong>正在搭建高塔…</strong><span>准备海面与物理世界</span></section>`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.root.removeEventListener('click', this.onClick);
    this.fields.clear(); this.root.replaceChildren();
  }
}
