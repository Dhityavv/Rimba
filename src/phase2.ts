import type { SupabaseClient } from '@supabase/supabase-js';
import { TEXT, type Lang } from './i18n';
import {
  GAME_CONFIG,
  OUTFIT_CATALOG,
  ROOM_TIERS,
  STARTER_SWORD_SPEC,
  WORLD_FACILITIES,
  WORSHIP_OPTIONS,
  formatCitizenNumber,
  getWibTimeInfo,
  isArenaTile,
  isDungeon1Tile,
  isDungeon2Tile,
  localBackend,
  renderChibiCharacterSvg,
  renderStarterSwordSvg,
  type AfkActivityType,
  type AfkSessionReport,
  type Character,
  type FacilityLandmark,
  type Listing,
  type WorkNode,
} from './localStore';
import './phase2.css';

type Position = { x: number; y: number };

type PhaseTwoOptions = {
  client: SupabaseClient | null;
  getLang: () => Lang;
  getUserId: () => string | null;
  getCharacter: () => Character | null;
  onCharacterUpdated: (char: Character) => void;
  openCharacterCreator: () => void;
  openKtpModal: () => void;
  hasCharacter: () => boolean;
  getPosition: () => Position | null;
  setPosition: (x: number, y: number) => void;
  getOnlineCount?: () => number;
  getServerRegionSummary?: () => {
    regionName?: string;
    regionCapacity?: number;
    registeredInRegion?: number;
    permanentInRegion?: number;
    onlineInRegion?: number;
    afkInRegion?: number;
  } | undefined;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!);

function getHatColor(hatId?: string): string | null {
  if (!hatId || hatId === 'none') return null;
  const found = OUTFIT_CATALOG.find(item => item.id === hatId && item.category === 'hat');
  return found && found.color !== 'transparent' ? found.color : null;
}

function formatCountdownHms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function mountPhaseTwo(options: PhaseTwoOptions) {
  const { client } = options;
  const shell = document.querySelector<HTMLElement>('.game-shell');
  if (!shell) throw new Error('Game shell is missing');

  shell.insertAdjacentHTML(
    'beforeend',
    `
    <aside class="right-dock" id="right-dock">
      <button type="button" class="dock-ktp-card" id="dock-ktp-btn">
        <span class="dock-avatar-dot" id="dock-avatar-dot" style="background:#5f9e6e">✦</span>
        <div class="dock-ktp-info">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <small id="dock-citizen-sub">MODE PENONTON</small>
            <span id="dock-status-badge" class="status-badge active" style="display:none">Aktif</span>
          </div>
          <b id="dock-citizen-name">Buat Karakter (KTP)</b>
          <div class="dock-vitals-strip" id="dock-vitals-strip">
            <span>HP <b id="dock-hp">100</b></span>
            <span>·</span>
            <span>Stm <b id="dock-stm">100</b></span>
            <span>·</span>
            <span>🪙 <b id="dock-coins">0</b></span>
            <span>·</span>
            <span>🏦 <b id="dock-bank">0</b></span>
            <span>·</span>
            <span>🪱 <b id="dock-bait">0</b></span>
          </div>
        </div>
      </button>
      <div class="dock-tools-row">
        <button type="button" class="dock-btn" id="dock-inv-btn">
          <span>🎒</span>
          <span id="dock-inv-label">Tas</span>
          <kbd>E</kbd>
        </button>
        <button type="button" class="dock-btn" id="dock-afk-vault-btn">
          <span>🎁</span>
          <span id="dock-afk-vault-label">Hasil AFK</span>
        </button>
        <button type="button" class="dock-btn" id="dock-world-btn">
          <span>🌐</span>
          <span id="dock-world-label">Wilayah & Berita</span>
        </button>
      </div>
    </aside>

    <div id="afk-banner" class="afk-mode-banner" style="display:none"></div>
    <div id="session-conflict-banner" class="session-conflict-banner" style="display:none"></div>
    <div id="toast-banner" class="toast-banner" style="display:none"></div>
    <div id="death-overlay" class="death-overlay-banner" style="display:none"></div>
    <button type="button" id="context-interact-pill" class="context-prompt-pill" style="display:none"></button>

    <nav class="hotbar-dock" id="hotbar-dock" aria-label="Hotbar">
      <button type="button" class="hotbar-slot equipped" id="hotbar-slot-1" title="Pedang Pemula Rimba (Spasi / Space)">
        <kbd class="hotbar-key">Space</kbd>
        <span class="hotbar-icon">${renderStarterSwordSvg()}</span>
        <span class="hotbar-label" id="hotbar-sword-label">Tebas</span>
        <span class="hotbar-cd-overlay" id="hotbar-sword-cd"></span>
      </button>
      <button type="button" class="hotbar-slot" id="hotbar-slot-2" title="Bekal Nasi Rimba (+45 Stm, +10 HP)">
        <kbd class="hotbar-key">2</kbd>
        <span class="hotbar-icon">🍙</span>
        <span class="hotbar-qty" id="hotbar-food-qty">0</span>
      </button>
      <button type="button" class="hotbar-slot" id="hotbar-slot-3" title="Teh Herba Hutan (+30 Stm)">
        <kbd class="hotbar-key">3</kbd>
        <span class="hotbar-icon">🍵</span>
        <span class="hotbar-qty" id="hotbar-tea-qty">0</span>
      </button>
      <button type="button" class="hotbar-slot" id="hotbar-slot-4" title="Interaksi / Ambil Resource / Fasilitas (F)">
        <kbd class="hotbar-key">F</kbd>
        <span class="hotbar-icon">🖐️</span>
        <span class="hotbar-label" id="hotbar-interact-label">Aksi</span>
      </button>
      <button type="button" class="hotbar-slot mobile-only-slot" id="hotbar-slot-pan" title="Mode Geser Kamera Sentuh">
        <kbd class="hotbar-key">Cam</kbd>
        <span class="hotbar-icon">🎥</span>
        <span class="hotbar-label" id="hotbar-pan-label">Kamera</span>
      </button>
    </nav>

    <div class="bottom-right-dock">
      <button type="button" id="world-info-btn" class="world-info-floating-btn">🌐 <span id="world-info-btn-label">Info & Berita</span></button>
      <button type="button" id="guide-btn" class="guide-floating-btn">📖 <span id="guide-btn-label">Panduan</span></button>
    </div>

    <div id="phase2-dialog-root"></div>
  `
  );

  let toastTimer: number | null = null;
  let inventoryModalOpen = false;
  let afkClaimInProgress = false;

  const t = () => TEXT[options.getLang()];

  const notifyPlayerInput = () => {
    window.dispatchEvent(new Event('rimba-player-valid-input'));
  };

  const showToast = (message: string, durationMs = 4200) => {
    const el = document.querySelector<HTMLElement>('#toast-banner');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      el.style.display = 'none';
    }, durationMs);
  };

  const closeModal = () => {
    const root = document.querySelector<HTMLElement>('#phase2-dialog-root');
    if (root) root.innerHTML = '';
    inventoryModalOpen = false;
  };

  const modal = (eyebrow: string, title: string, content: string) => {
    const root = document.querySelector<HTMLElement>('#phase2-dialog-root')!;
    root.innerHTML = `
      <div class="phase2-scrim" id="phase2-scrim">
        <section class="phase2-dialog">
          <button class="phase2-close" id="phase2-close" type="button" aria-label="${escapeHtml(t().close)}">×</button>
          <small>${escapeHtml(eyebrow)}</small>
          <h2>${escapeHtml(title)}</h2>
          ${content}
        </section>
      </div>
    `;
    document.querySelector<HTMLButtonElement>('#phase2-close')!.onclick = closeModal;
    document.querySelector<HTMLElement>('#phase2-scrim')!.addEventListener('click', event => {
      if (event.target === document.querySelector('#phase2-scrim')) closeModal();
    });
  };

  const getDeathState = () => {
    const uid = options.getUserId();
    if (!uid || !options.hasCharacter()) {
      return { locked: false, active: false, readyToRevive: false, remainingSec: 0, penalty: 0 };
    }
    return localBackend.isDownedOrWaitingRevive(uid);
  };

  const formatAfkActivityLabel = (act: AfkActivityType): string => {
    const dict = t();
    if (act === 'wood') return dict.afkActWood;
    if (act === 'stone') return dict.afkActStone;
    if (act === 'fish') return dict.afkActFish;
    if (act === 'dungeon') return dict.afkActDungeon;
    return dict.afkActStroll;
  };

  const updateRightDock = () => {
    const lang = options.getLang();
    const dict = t();
    const char = options.getCharacter();
    const uid = options.getUserId();

    const subEl = document.querySelector<HTMLElement>('#dock-citizen-sub');
    const badgeEl = document.querySelector<HTMLElement>('#dock-status-badge');
    const nameEl = document.querySelector<HTMLElement>('#dock-citizen-name');
    const dotEl = document.querySelector<HTMLElement>('#dock-avatar-dot');
    const hpEl = document.querySelector<HTMLElement>('#dock-hp');
    const stmEl = document.querySelector<HTMLElement>('#dock-stm');
    const coinsEl = document.querySelector<HTMLElement>('#dock-coins');
    const bankEl = document.querySelector<HTMLElement>('#dock-bank');
    const baitEl = document.querySelector<HTMLElement>('#dock-bait');
    const invLabel = document.querySelector<HTMLElement>('#dock-inv-label');
    const afkVaultBtn = document.querySelector<HTMLButtonElement>('#dock-afk-vault-btn');
    const afkVaultLabel = document.querySelector<HTMLElement>('#dock-afk-vault-label');
    const worldLabel = document.querySelector<HTMLElement>('#dock-world-label');
    const worldBtnLabel = document.querySelector<HTMLElement>('#world-info-btn-label');
    const guideLabel = document.querySelector<HTMLElement>('#guide-btn-label');
    const afkBanner = document.querySelector<HTMLElement>('#afk-banner');

    const hotbarDock = document.querySelector<HTMLElement>('#hotbar-dock');
    const hotbarSwordLabel = document.querySelector<HTMLElement>('#hotbar-sword-label');
    const hotbarFoodQty = document.querySelector<HTMLElement>('#hotbar-food-qty');
    const hotbarTeaQty = document.querySelector<HTMLElement>('#hotbar-tea-qty');
    const hotbarInteractLabel = document.querySelector<HTMLElement>('#hotbar-interact-label');
    const hotbarPanLabel = document.querySelector<HTMLElement>('#hotbar-pan-label');
    const conflictTitle = document.querySelector<HTMLElement>('#session-conflict-title');
    const conflictDesc = document.querySelector<HTMLElement>('#session-conflict-desc');
    const conflictBtn = document.querySelector<HTMLButtonElement>('#session-reclaim-btn');

    if (invLabel) invLabel.textContent = lang === 'en' ? 'Bag' : 'Tas';
    if (worldLabel) worldLabel.textContent = lang === 'en' ? 'World & News' : 'Wilayah & Berita';
    if (worldBtnLabel) worldBtnLabel.textContent = dict.infoNewsBtn;
    if (guideLabel) guideLabel.textContent = dict.guideBtn;
    if (hotbarSwordLabel) hotbarSwordLabel.textContent = dict.hotbarAttackLabel;
    if (hotbarInteractLabel) hotbarInteractLabel.textContent = dict.hotbarInteractLabel;
    if (hotbarPanLabel) hotbarPanLabel.textContent = dict.hotbarPanLabel;
    if (conflictTitle) conflictTitle.textContent = dict.sessionConflictTitle;
    if (conflictDesc) conflictDesc.textContent = dict.sessionConflictDesc;
    if (conflictBtn) conflictBtn.textContent = dict.sessionReclaimBtn;

    if (!uid || !char) {
      if (subEl) subEl.textContent = lang === 'en' ? 'SPECTATOR MODE' : 'MODE PENONTON';
      if (badgeEl) badgeEl.style.display = 'none';
      if (nameEl) nameEl.textContent = dict.createCharBtn;
      if (dotEl) {
        dotEl.style.background = '#64748b';
        dotEl.innerHTML = '✦';
      }
      if (hpEl) hpEl.textContent = '—';
      if (stmEl) stmEl.textContent = '—';
      if (coinsEl) coinsEl.textContent = '—';
      if (bankEl) bankEl.textContent = '—';
      if (baitEl) baitEl.textContent = '—';
      if (afkVaultLabel) afkVaultLabel.textContent = dict.afkVaultBtn;
      if (afkVaultBtn) afkVaultBtn.classList.remove('vault-ready');
      if (afkBanner) afkBanner.style.display = 'none';
      if (hotbarDock) hotbarDock.style.display = 'none';
      return;
    }

    if (hotbarDock) hotbarDock.style.display = 'flex';
    const inv = localBackend.getInventory(uid);
    const dead = getDeathState();
    const statusLabel =
      lang === 'en'
        ? char.residence_status === 'Penduduk'
          ? 'RESIDENT'
          : 'CITIZEN'
        : char.residence_status.toUpperCase();
    if (subEl) subEl.textContent = `${statusLabel} • #${formatCitizenNumber(char.citizen_number)}`;
    if (nameEl) nameEl.textContent = `${char.display_name} (${dict.ktpBtn})`;
    if (dotEl) {
      dotEl.style.background = 'linear-gradient(180deg, #dbeafe 0%, #dcfce7 75%)';
      dotEl.innerHTML = renderChibiCharacterSvg(char.model_id, char.avatar_color, getHatColor(char.hat_id));
    }
    if (hpEl) hpEl.textContent = `${inv.hp}/${inv.max_hp}`;
    if (stmEl) stmEl.textContent = `${inv.stamina}/${inv.max_stamina}`;
    if (coinsEl) coinsEl.textContent = String(inv.coins);
    if (bankEl) bankEl.textContent = String(inv.bank_balance ?? 0);
    if (baitEl) baitEl.textContent = String(inv.fish_bait ?? 0);
    if (hotbarFoodQty) hotbarFoodQty.textContent = `x${inv.food_rations ?? 0}`;
    if (hotbarTeaQty) hotbarTeaQty.textContent = `x${inv.herbal_tea ?? 0}`;

    const vault = inv.afk_vault;
    const totalPending = vault ? vault.wood + vault.stone + vault.fish + vault.coins : 0;
    if (afkVaultLabel) {
      afkVaultLabel.textContent = totalPending > 0 ? `${dict.afkVaultBtn} (${totalPending})` : dict.afkVaultBtn;
    }
    if (afkVaultBtn) {
      afkVaultBtn.classList.toggle('vault-ready', totalPending > 0);
    }

    if (badgeEl) {
      badgeEl.style.display = 'inline-flex';
      if (dead.active) {
        badgeEl.className = 'status-badge recovering';
        badgeEl.textContent = dict.statusRecovering;
      } else if (dead.readyToRevive) {
        badgeEl.className = 'status-badge dead';
        badgeEl.textContent = dict.statusDead;
      } else if (inv.player_status === 'afk') {
        badgeEl.className = 'status-badge afk';
        badgeEl.textContent = dict.statusAfk;
      } else {
        badgeEl.className = 'status-badge active';
        badgeEl.textContent = dict.statusActive;
      }
    }

    if (afkBanner) {
      if (inv.player_status === 'afk' && !dead.locked) {
        const currentAct =
          inv.afk_phase === 'stroll' ? dict.afkActStroll : formatAfkActivityLabel(inv.afk_activity);
        afkBanner.style.display = 'block';
        afkBanner.innerHTML = `
          <b>🌙 ${escapeHtml(dict.afkBannerTitle)} — ${escapeHtml(currentAct)}</b>
          <small>${escapeHtml(dict.afkBannerSub)}</small>
        `;
      } else {
        afkBanner.style.display = 'none';
      }
    }
  };

  // --- AFK HOLDING VAULT ("Hasil AFK") & MANUAL CLAIM MODAL (Section 8) ---
  const openAfkVaultModal = (report?: AfkSessionReport) => {
    const uid = options.getUserId();
    const char = options.getCharacter();
    const lang = options.getLang();
    const dict = t();

    if (!uid || !char) {
      showToast(dict.spectatorBanner);
      options.openCharacterCreator();
      return;
    }

    const inv = localBackend.getInventory(uid);
    const vault = inv.afk_vault;
    const usedUnits = localBackend.getUsedBagUnits(inv);
    const hasClaimable = vault.wood + vault.stone + vault.fish + vault.coins > 0;

    modal(
      dict.afkVaultSub,
      dict.afkVaultTitle,
      `
      <p class="phase2-copy">${escapeHtml(dict.afkVaultDesc)}</p>
      <div class="afk-report-box">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <b>📋 ${escapeHtml(dict.afkReportHeader)} (${vault.duration_minutes} min)</b>
          <span class="news-badge">${escapeHtml(dict.afkVaultEfficiency)}</span>
        </div>
        <ul>
          <li>- ${escapeHtml(dict.afkReportWood)}: <b>+${vault.wood}</b></li>
          <li>- ${escapeHtml(dict.afkReportStone)}: <b>+${vault.stone}</b></li>
          <li>- ${escapeHtml(dict.afkReportFish)}: <b>+${vault.fish}</b></li>
          <li>- ${escapeHtml(dict.afkReportBait)}: <b>${vault.bait_used}</b></li>
          <li>- ${escapeHtml(dict.afkReportCoin)}: <b>+${vault.coins}</b></li>
          <li>- <b>${escapeHtml(vault.died_in_dungeon || report?.died_in_dungeon ? dict.afkReportDeathYes : dict.afkReportNoDeath)}</b></li>
        </ul>
      </div>
      ${
        vault.died_in_dungeon || report?.died_in_dungeon
          ? `<div class="phase2-listing" style="background:#fef2f2;border-color:#fca5a5;margin-bottom:10px">
              <span>
                <b style="color:#991b1b">⚠️ -${vault.death_coin_penalty || report?.death_coin_penalty || 0} Coin (10% Penalty)</b>
                <small style="color:#7f1d1d">${escapeHtml(dict.afkReportDeathNote)}</small>
              </span>
            </div>`
          : ''
      }
      <div class="phase2-listing" style="background:#f5efe0;margin-bottom:10px">
        <span>
          <b>🎒 ${lang === 'en' ? 'Current Bag Capacity' : 'Kapasitas Tas Saat Ini'}: ${usedUnits}/${inv.max_capacity} unit</b>
          <small>${
            hasClaimable
              ? lang === 'en'
                ? 'Click Claim below to move stored AFK items & coins into your main inventory.'
                : 'Klik tombol Klaim di bawah untuk memindahkan hasil AFK ke inventory & Coin utama.'
              : escapeHtml(dict.afkVaultEmpty)
          }</small>
        </span>
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="phase2-primary" id="afk-vault-claim-btn" ${!hasClaimable || afkClaimInProgress ? 'disabled' : ''}>
          🎁 ${escapeHtml(dict.afkVaultClaimBtn)}
        </button>
        <button type="button" class="phase2-primary" id="afk-vault-close-btn" style="background:#e2e8f0;color:#1e293b">
          ${escapeHtml(dict.close)}
        </button>
      </div>
    `
    );

    const closeBtn = document.querySelector<HTMLButtonElement>('#afk-vault-close-btn');
    if (closeBtn) closeBtn.onclick = closeModal;

    const claimBtn = document.querySelector<HTMLButtonElement>('#afk-vault-claim-btn');
    if (claimBtn) {
      claimBtn.onclick = () => {
        if (afkClaimInProgress) return;
        afkClaimInProgress = true;
        claimBtn.disabled = true;
        try {
          const res = localBackend.claimAfkVault(uid, lang);
          updateRightDock();
          showToast(res.message, 5200);
          openAfkVaultModal();
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        } finally {
          afkClaimInProgress = false;
        }
      };
    }
  };

  // --- WORLD INFO, TOWN NEWS & CREATOR MODAL (Sections 4, 5, 6) ---
  const openWorldInfoModal = (initialTab: 'region' | 'news' | 'creator' = 'region') => {
    notifyPlayerInput();
    const lang = options.getLang();
    const dict = t();
    const char = options.getCharacter();
    const stats = localBackend.getWorldRegionAndNewsStats(
      1,
      char?.home_region ?? 'Wilayah 1',
      options.getServerRegionSummary?.() ?? undefined
    );

    const renderTabContent = (activeTab: 'region' | 'news' | 'creator') => {
      if (activeTab === 'region') {
        const visualNote = dict.regionVisualAfkNote
          .replace('{visual}', String(stats.visualSimulatedAfkActive))
          .replace('{total}', String(stats.totalRegisteredCitizens));

        return `
          <div class="stat-grid">
            <div class="stat-card">
              <small>${lang === 'en' ? 'ACTIVE REGION' : 'WILAYAH AKTIF'}</small>
              <b>${escapeHtml(stats.regionName)}</b>
              <span>${escapeHtml(dict.regionCapLabel)}</span>
            </div>
            <div class="stat-card">
              <small>${escapeHtml(dict.regionTotalRegistered.toUpperCase())}</small>
              <b>${stats.totalRegisteredCitizens}</b>
              <span>${stats.totalPermanentResidents} ${lang === 'en' ? 'Permanent Residents' : 'Penduduk Tetap'}</span>
            </div>
            <div class="stat-card">
              <small>${escapeHtml(dict.regionOnlineNow.toUpperCase())}</small>
              <b>${stats.activeOnlinePlayers}</b>
              <span>${lang === 'en' ? 'Active manual control' : 'Kendali manual aktif'}</span>
            </div>
            <div class="stat-card" title="${escapeHtml(visualNote)}">
              <small>${escapeHtml(dict.regionSimPopulation.toUpperCase())}</small>
              <b>${stats.regionPopulationDisplay}</b>
              <span>${escapeHtml(visualNote)}</span>
            </div>
          </div>

          <div class="phase2-listing" style="flex-direction:column;align-items:stretch;background:#f5efe0;margin-bottom:10px">
            <b>⚙️ ${lang === 'en' ? '3-Minute AFK Cycle & 60% Efficiency Vault' : 'Siklus AFK 3 Menit & Penyimpanan Sementara 60%'}</b>
            <small>${
              lang === 'en'
                ? 'Enter AFK after 30s without input: 3m Stroll on safe paths + 3m single random work (never repeating the previous work job). All AFK gains are stored in AFK Rewards at 60% efficiency until manually claimed.'
                : 'Masuk AFK setelah 30 detik tanpa input: 3 menit jalan santai di jalur aman + 3 menit 1 pekerjaan acak (berbeda dari pekerjaan sebelumnya). Hasil AFK disimpan di Hasil AFK dengan efisiensi 60% hingga diklaim manual.'
            }</small>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px;font-size:12px">
              <span>🚶 ${escapeHtml(dict.afkActStroll)}: <b>3 min (${lang === 'en' ? 'Alternating' : 'Bergantian'})</b></span>
              <span>🪵 ${escapeHtml(dict.afkActWood)}: <b>${stats.afkDistribution.wood}% (${lang === 'en' ? 'Work Roll' : 'Peluang Kerja'})</b></span>
              <span>⛏️ ${escapeHtml(dict.afkActStone)}: <b>${stats.afkDistribution.stone}% (${lang === 'en' ? 'Work Roll' : 'Peluang Kerja'})</b></span>
              <span>🎣 ${escapeHtml(dict.afkActFish)}: <b>${stats.afkDistribution.fish}% (${lang === 'en' ? 'Work Roll' : 'Peluang Kerja'})</b></span>
              <span>⚔️ ${escapeHtml(dict.afkActDungeon)}: <b>${stats.afkDistribution.dungeon}% (5% Death Risk)</b></span>
              <span>🏟️ Arena PvP: <b>0% (${lang === 'en' ? 'Forbidden' : 'Dilarang AFK'})</b></span>
            </div>
          </div>
        `;
      }

      if (activeTab === 'news') {
        return `
          <div class="phase2-listings">
            ${stats.news
              .map(
                item => `
              <div class="news-card">
                <div class="news-card-head">
                  <span class="news-badge">${escapeHtml(lang === 'en' ? item.category_en : item.category_id)}</span>
                  <small>${escapeHtml(item.date)}</small>
                </div>
                <b>${escapeHtml(lang === 'en' ? item.title_en : item.title_id)}</b>
                <p>${escapeHtml(lang === 'en' ? item.body_en : item.body_id)}</p>
              </div>
            `
              )
              .join('')}
          </div>
        `;
      }

      return `
        <div class="creator-card">
          <small style="color:#8c6b32;font-weight:800;letter-spacing:0.08em">${
            lang === 'en' ? 'OFFICIAL CREATOR & DEVELOPER' : 'KREATOR & PENGEMBANG RESMI'
          }</small>
          <h4>${escapeHtml(stats.creator.name)}</h4>
          <p style="margin:4px 0 10px;font-size:12.5px;color:#0f766e;font-weight:700">${escapeHtml(
            lang === 'en' ? stats.creator.role_en : stats.creator.role_id
          )}</p>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#334155">${escapeHtml(
            lang === 'en' ? stats.creator.vision_en : stats.creator.vision_id
          )}</p>

          <div class="creator-links-grid">
            <a class="creator-link-btn" href="${escapeHtml(stats.creator.website_url)}" target="_blank" rel="noopener noreferrer">
              🌐 ${escapeHtml(dict.creatorWebsiteBtn)} ↗
            </a>
            <a class="creator-link-btn" href="${escapeHtml(stats.creator.tiktok_url)}" target="_blank" rel="noopener noreferrer">
              🎵 ${escapeHtml(dict.creatorTiktokBtn)} ↗
            </a>
            <a class="creator-link-btn support" href="${escapeHtml(stats.creator.saweria_url)}" target="_blank" rel="noopener noreferrer">
              ☕ ${escapeHtml(dict.creatorSupportBtn)} ↗
            </a>
          </div>
          <p class="phase2-note" style="margin:4px 0 12px;font-size:11px">${escapeHtml(dict.creatorSupportNote)}</p>

          <div class="phase2-listing" style="background:#f8fafc">
            <span>
              <b>📦 GitHub Repository</b>
              <small>${escapeHtml(stats.creator.repo)}</small>
            </span>
            <span class="status-badge active">${escapeHtml(stats.creator.version)}</span>
          </div>
        </div>
      `;
    };

    const drawModal = (tab: 'region' | 'news' | 'creator') => {
      modal(
        dict.worldInfoModalSub,
        dict.worldInfoModalTitle,
        `
        <div class="info-tabs">
          <button type="button" class="info-tab-btn ${tab === 'region' ? 'active' : ''}" data-info-tab="region">${escapeHtml(dict.tabRegionStats)}</button>
          <button type="button" class="info-tab-btn ${tab === 'news' ? 'active' : ''}" data-info-tab="news">${escapeHtml(dict.tabTownNews)}</button>
          <button type="button" class="info-tab-btn ${tab === 'creator' ? 'active' : ''}" data-info-tab="creator">${escapeHtml(dict.tabCreatorInfo)}</button>
        </div>
        ${renderTabContent(tab)}
      `
      );

      document.querySelectorAll<HTMLButtonElement>('[data-info-tab]').forEach(btn => {
        btn.onclick = () => {
          const nextTab = btn.dataset.infoTab as 'region' | 'news' | 'creator';
          drawModal(nextTab);
        };
      });
    };

    drawModal(initialTab);
  };

  // --- INVENTORY MODAL (Key E or Bag Icon) ---
  const toggleInventoryModal = () => {
    notifyPlayerInput();
    if (inventoryModalOpen) {
      closeModal();
      return;
    }
    const uid = options.getUserId();
    const char = options.getCharacter();
    const lang = options.getLang();
    const dict = t();

    if (!uid || !char) {
      showToast(dict.spectatorBanner);
      options.openCharacterCreator();
      return;
    }

    inventoryModalOpen = true;
    const inv = localBackend.getInventory(uid);
    const usedUnits = localBackend.getUsedBagUnits(inv);

    const items: Array<{
      name: string;
      qty: string;
      cat: string;
      desc: string;
      actionHtml: string;
      iconHtml?: string;
    }> = [];

    items.push({
      name: dict.starterSwordName,
      qty: '1 unit',
      cat: dict.catWeapon,
      desc: `${dict.starterSwordDesc} (DMG ${STARTER_SWORD_SPEC.damage} · Range ${STARTER_SWORD_SPEC.range_tiles} · CD ${STARTER_SWORD_SPEC.cooldown_ms}ms)`,
      actionHtml: `<button type="button" disabled title="${escapeHtml(dict.starterSwordBoundBadge)}">${escapeHtml(dict.starterSwordBoundBadge)}</button>`,
      iconHtml: renderStarterSwordSvg(28),
    });

    items.push({
      name: dict.itemBaitName,
      qty: `${inv.fish_bait ?? 0} unit`,
      cat: dict.catBait,
      desc: dict.itemBaitDesc,
      actionHtml: '',
    });

    if (inv.wood > 0) {
      items.push({
        name: lang === 'en' ? 'Lumber Wood' : 'Kayu Area Kerja',
        qty: `${inv.wood} unit`,
        cat: dict.catResource,
        desc:
          lang === 'en'
            ? 'Harvested from East Logging Camp. Can be sold at Central Market.'
            : 'Dikumpulkan dari Area Kerja Kayu Timur. Dapat dijual di Pasar Central.',
        actionHtml: '',
      });
    }
    if (inv.stone > 0) {
      items.push({
        name: lang === 'en' ? 'Quarry Stone' : 'Batu Tambang',
        qty: `${inv.stone} unit`,
        cat: dict.catResource,
        desc:
          lang === 'en'
            ? 'Mined from South Stone Quarry. Tradeable at Central Market.'
            : 'Ditambang dari Area Kerja Batu Selatan. Dapat diperdagangkan di Pasar.',
        actionHtml: '',
      });
    }
    if (inv.fish > 0) {
      items.push({
        name: lang === 'en' ? 'Fresh Lake Fish' : 'Ikan Segar Danau',
        qty: `${inv.fish} ekor`,
        cat: dict.catResource,
        desc: lang === 'en' ? 'Caught at the Great Northern Lake.' : 'Hasil memancing di Danau Besar Utara.',
        actionHtml: '',
      });
    }
    if (inv.crystal_shard > 0) {
      items.push({
        name: lang === 'en' ? 'Dungeon Crystal Shard' : 'Pecahan Kristal Dungeon',
        qty: `${inv.crystal_shard} keping`,
        cat: dict.catResource,
        desc:
          lang === 'en'
            ? 'Rare drop from Dungeon Slime & Goblin monsters. Reserved for future Academy crafting (Coming Soon).'
            : 'Drop langka monster Slime & Goblin Dungeon. Disimpan untuk kerajinan Academy mendatang (Coming Soon).',
        actionHtml: '',
      });
    }
    if (inv.data_forms > 0) {
      items.push({
        name: lang === 'en' ? 'Data Change Form' : 'Formulir Perubahan Data',
        qty: `${inv.data_forms} lembar`,
        cat: dict.catDocument,
        desc:
          lang === 'en'
            ? 'Used at Central Town Hall to edit Citizen ID name, age, or bio.'
            : 'Digunakan di Balai Kota Central untuk mengubah nama, umur, atau deskripsi KTP.',
        actionHtml: '',
      });
    }
    if (inv.active_room) {
      const roomName = lang === 'en' ? inv.active_room.tier_name_en : inv.active_room.tier_name_id;
      items.push({
        name: `${roomName} (${inv.active_room.room_number})`,
        qty: '1',
        cat: dict.catKey,
        desc:
          lang === 'en'
            ? `Active until ${new Date(inv.active_room.expires_at).toLocaleString()}`
            : `Aktif hingga ${new Date(inv.active_room.expires_at).toLocaleString('id-ID')}`,
        actionHtml: '',
      });
    }
    if (inv.food_rations > 0) {
      items.push({
        name: lang === 'en' ? 'Rimba Rice Ration' : 'Bekal Nasi Rimba',
        qty: `${inv.food_rations} porsi`,
        cat: dict.catConsumable,
        desc: '+45 Stamina, +10 HP',
        actionHtml: `<button type="button" data-use-item="food">${dict.invUse}</button>`,
      });
    }
    if (inv.herbal_tea > 0) {
      items.push({
        name: lang === 'en' ? 'Forest Herbal Tea' : 'Teh Herba Hutan',
        qty: `${inv.herbal_tea} botol`,
        cat: dict.catConsumable,
        desc: '+30 Stamina',
        actionHtml: `<button type="button" data-use-item="tea">${dict.invUse}</button>`,
      });
    }
    if (inv.grilled_fish > 0) {
      items.push({
        name: lang === 'en' ? 'Grilled Lake Fish' : 'Ikan Bakar Danau',
        qty: `${inv.grilled_fish} porsi`,
        cat: dict.catConsumable,
        desc: '+65 Stamina, +25 HP',
        actionHtml: `<button type="button" data-use-item="fish_meal">${dict.invUse}</button>`,
      });
    }

    for (const outfitId of inv.owned_outfits) {
      if (outfitId === 'none') continue;
      const spec = OUTFIT_CATALOG.find(o => o.id === outfitId);
      if (!spec) continue;
      const isEquipped = char.outfit_id === spec.id || char.hat_id === spec.id;
      items.push({
        name: lang === 'en' ? spec.name_en : spec.name_id,
        qty: '1',
        cat: spec.category === 'outfit' ? dict.catOutfit : dict.catHat,
        desc: lang === 'en' ? spec.desc_en : spec.desc_id,
        actionHtml: isEquipped
          ? spec.category === 'hat'
            ? `<button type="button" data-equip-item="none">${dict.invUnequip}</button>`
            : `<button type="button" disabled>${dict.invEquipped}</button>`
          : `<button type="button" data-equip-item="${escapeHtml(spec.id)}">${dict.invEquip}</button>`,
      });
    }

    const rowsHtml = items.length
      ? items
          .map(
            it => `
        <div class="phase2-listing">
          <span style="display:flex;align-items:center;gap:10px">
            ${it.iconHtml ? `<span class="inv-item-icon">${it.iconHtml}</span>` : ''}
            <span>
              <b>${escapeHtml(it.name)} <small style="color:#8c6b32">(${escapeHtml(it.cat)} · ${escapeHtml(it.qty)})</small></b>
              <small>${escapeHtml(it.desc)}</small>
            </span>
          </span>
          ${it.actionHtml}
        </div>
      `
          )
          .join('')
      : `<p class="phase2-note">${escapeHtml(dict.invEmpty)}</p>`;

    const roomSummary = inv.active_room
      ? `${lang === 'en' ? inv.active_room.tier_name_en : inv.active_room.tier_name_id} #${inv.active_room.room_number}`
      : dict.invNoRoom;

    modal(
      `${dict.inventorySub} (${usedUnits}/${inv.max_capacity})`,
      dict.inventoryTitle,
      `
      <div class="phase2-listing" style="margin-bottom:12px;background:#f5efe0">
        <span>
          <b>${dict.invCoins}: ${inv.coins} · 🏦 Bank: ${inv.bank_balance ?? 0} · ${dict.invHp}: ${inv.hp}/${inv.max_hp} · ${dict.invStamina}: ${inv.stamina}/${inv.max_stamina} · 🪱 ${dict.catBait}: ${inv.fish_bait ?? 0}</b>
          <small>${dict.invRoomStatus}: ${escapeHtml(roomSummary)}</small>
        </span>
      </div>
      <div class="phase2-listings">${rowsHtml}</div>
    `
    );

    document.querySelectorAll<HTMLButtonElement>('[data-use-item]').forEach(btn => {
      btn.onclick = () => {
        try {
          const itemType = btn.dataset.useItem as 'food' | 'tea' | 'fish_meal';
          localBackend.consumeItem(uid, itemType, lang);
          updateRightDock();
          inventoryModalOpen = false;
          toggleInventoryModal();
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      };
    });

    document.querySelectorAll<HTMLButtonElement>('[data-equip-item]').forEach(btn => {
      btn.onclick = () => {
        try {
          const { character: updatedChar } = localBackend.buyOrEquipOutfit(uid, btn.dataset.equipItem!, lang);
          options.onCharacterUpdated(updatedChar);
          updateRightDock();
          inventoryModalOpen = false;
          toggleInventoryModal();
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      };
    });
  };

  // --- PLAYER GUIDE MODAL (Bottom-Right Button) ---
  const openGuideModal = () => {
    notifyPlayerInput();
    const lang = options.getLang();
    const dict = t();

    const sections =
      lang === 'en'
        ? [
            {
              title: '1. Controls & Camera Navigation',
              body: 'WASD: Move character · Left-click: Walk to point · Spacebar: Attack valid target in range · E: Open/close Inventory · F: Contextual interaction / gather resource / use facility · Right-click hold & drag: Pan/move camera at any time (even while AFK, downed, or spectating).',
            },
            {
              title: '2. Citizen ID (KTP) & Pure Player World (No NPCs)',
              body: 'Rimba has no NPCs. Every character in the world belongs to a registered player account with a KTP. Facilities (Market, Bank, Hospital, Inn, Town Hall) are accessed directly via building proximity with [F] or clicking the building.',
            },
            {
              title: '3. Gathering Resources [F] & Fishing Bait',
              body: 'Walk to the East Logging Camp (44,28) for Wood, South Stone Quarry (38,45) for Stone, or North Great Lake Pier (28,14) for Fishing. Fishing requires Lake Fishing Bait in your bag.',
            },
            {
              title: '4. Rimba Bank, Safe Savings & 3% Daily Interest (12:00 WIB)',
              body: 'Walk to Rimba Bank at Central (25,22) to deposit or withdraw coins. Coins in Bank savings are protected from the 10% death penalty and earn 3% interest every day at 12:00 WIB (Asia/Jakarta).',
            },
            {
              title: '5. Simplified Dungeons (Slime & Goblin) & Physical PvP Arena',
              body: 'Upper Dungeon (9,10) spawns Slimes only; Lower Dungeon (47,46) spawns Goblins only. Press Spacebar when in range to attack monsters—attacking does NOT reduce your HP; your HP only drops when a monster chases and counterattacks you in range. Entering the Northeast Arena (45,11) activates PvP = ON; leaving turns PvP = OFF.',
            },
            {
              title: '6. 3-Minute AFK Cycle & 60% AFK Rewards Vault',
              body: 'After 30 seconds without input, Citizen characters enter AFK mode: alternating 3 minutes strolling on safe paths and 3 minutes on 1 random work job (never repeating the previous work job, with a 5% chance to visit low-risk Dungeon with 5% death risk). AFK gains are stored in AFK Rewards at 60% efficiency until you click Claim.',
            },
            {
              title: '7. 10-Minute Death Cooldown & Manual Revive Button',
              body: 'If your HP reaches 0, carried coins (outside Bank) drop by 10% once and a 10-minute cooldown starts. When the timer reaches 00:00, click the Revive (Bangkit) button to respawn at Central Hospital.',
            },
          ]
        : [
            {
              title: '1. Kontrol Permainan & Kamera Klik Kanan',
              body: 'WASD: Gerak karakter · Klik kiri: Jalan ke titik · Spasi: Serang target valid dalam jangkauan · E: Buka/tutup Inventory · F: Interaksi kontekstual / ambil resource / gunakan fasilitas · Klik kanan tahan & geser: Geser kamera kapan saja (termasuk saat hidup, AFK, tumbang, atau menunggu bangkit).',
            },
            {
              title: '2. KTP Warga & Dunia Murni Akun Pemain (Tanpa NPC)',
              body: 'Dunia Rimba tidak memiliki NPC. Seluruh karakter di dunia berasal dari akun pemain terdaftar yang memiliki KTP game. Fasilitas seperti Pasar, Bank, Rumah Sakit, dan Penginapan digunakan langsung pada titik interaksi bangunan dengan [F] atau klik bangunan.',
            },
            {
              title: '3. Mengumpulkan Resource [F] & Aturan Umpan Memancing',
              body: 'Berjalanlah ke Area Kerja Kayu Timur (44,28), Area Tambang Batu Selatan (38,45), atau Dermaga Danau Besar Utara (28,14) untuk memancing dengan Umpan Pancing Danau.',
            },
            {
              title: '4. Bank Rimba, Tabungan Aman & Bunga 3% per Hari (12:00 WIB)',
              body: 'Datangi gedung Bank Rimba di Central (25,22) untuk menyetor atau menarik Coin. Coin di Bank aman dari penalti kematian 10% dan bertambah 3% setiap hari pada pukul 12:00 WIB (Asia/Jakarta).',
            },
            {
              title: '5. Mekanik Monster (Slime & Goblin) & Zona Fisik Arena PvP',
              body: 'Dungeon Atas (9,10) hanya berisi Slime; Dungeon Bawah (47,46) hanya berisi Goblin. Tekan Spasi saat dalam jangkauan untuk menyerang—menekan serang TIDAK mengurangi HP pemain; HP hanya berkurang jika monster mengejar dan membalas serangan dalam jarak serang. Masuk ke area Arena (45,11) mengaktifkan PvP = ON; keluar dari Arena mengembalikan PvP = OFF.',
            },
            {
              title: '6. Siklus AFK 3 Menit & Klaim Manual Hasil AFK (Efisiensi 60%)',
              body: 'Setelah 30 detik tanpa input, karakter masuk mode AFK dengan nama (AFK): bergantian 3 menit jalan santai dan 3 menit 1 pekerjaan acak yang berbeda dari pekerjaan sebelumnya (termasuk peluang 5% ke Dungeon risiko kematian 5%). Hasil AFK dihitung dengan efisiensi 60% dan disimpan di menu Hasil AFK hingga diklaim manual.',
            },
            {
              title: '7. Cooldown Kematian 10 Menit & Tombol Bangkit Manual',
              body: 'Saat HP habis (0), Coin yang dibawa di tas berkurang 10% satu kali dan karakter masuk cooldown 10 menit. Saat timer mencapai 00:00, karakter tidak langsung hidup otomatis—klik tombol Bangkit untuk hidup kembali di Rumah Sakit Central.',
            },
          ];

    modal(
      dict.guideModalSub,
      dict.guideModalTitle,
      `<div>${sections.map(s => `<div class="guide-section"><b>${escapeHtml(s.title)}</b><p>${escapeHtml(s.body)}</p></div>`).join('')}</div>`
    );
  };

  // --- FACILITY MODALS (Opened ONLY when player is in range of the building!) ---
  const openFacilityById = async (facilityId: FacilityLandmark['id']) => {
    notifyPlayerInput();
    const lang = options.getLang();
    const dict = t();
    const uid = options.getUserId();
    const char = options.getCharacter();

    if (!uid || !char) {
      showToast(dict.spectatorBanner);
      options.openCharacterCreator();
      return;
    }

    const dead = getDeathState();
    if (dead.locked && facilityId !== 'rumahsakit') {
      showToast(dead.readyToRevive ? dict.deathReadyBanner : dict.deathBannerSub);
      return;
    }

    const pos = options.getPosition() ?? GAME_CONFIG.CENTRAL_SPAWN;
    const inv = localBackend.getInventory(uid);

    if (facilityId === 'bank') {
      const wib = getWibTimeInfo();
      const nextInterest = Math.floor((inv.bank_balance ?? 0) * GAME_CONFIG.BANK_DAILY_INTEREST_RATE);
      const historyRows =
        inv.bank_history && inv.bank_history.length > 0
          ? inv.bank_history
              .slice(0, 6)
              .map(tx => {
                const badge =
                  tx.type === 'deposit'
                    ? lang === 'en'
                      ? '⬆️ Deposit'
                      : '⬆️ Setor'
                    : tx.type === 'withdraw'
                      ? lang === 'en'
                        ? '⬇️ Withdraw'
                        : '⬇️ Tarik'
                      : lang === 'en'
                        ? '✨ 3% Interest'
                        : '✨ Bunga 3%';
                return `
                  <div class="phase2-listing">
                    <span>
                      <b>${escapeHtml(badge)}: ${tx.amount} Coin</b>
                      <small>${escapeHtml(tx.note)} · ${escapeHtml(new Date(tx.created_at).toLocaleString(lang === 'en' ? 'en-US' : 'id-ID'))}</small>
                    </span>
                    <b style="color:#0f766e">${tx.balance_after} Coin</b>
                  </div>
                `;
              })
              .join('')
          : `<p class="phase2-note">${escapeHtml(dict.bankNoHistory)}</p>`;

      modal(
        dict.bankSub,
        dict.bankTitle,
        `
        <p class="phase2-copy">${escapeHtml(dict.bankDesc)}</p>
        <div class="stat-grid">
          <div class="stat-card">
            <small>${escapeHtml(dict.bankCarriedCoins)}</small>
            <b>🪙 ${inv.coins}</b>
            <span>${lang === 'en' ? 'Vulnerable to 10% death penalty' : 'Terkena penalti 10% jika mati'}</span>
          </div>
          <div class="stat-card">
            <small>${escapeHtml(dict.bankSavedCoins)}</small>
            <b>🏦 ${inv.bank_balance ?? 0}</b>
            <span>${lang === 'en' ? '100% safe from death penalty' : 'Aman dari penalti kematian'}</span>
          </div>
          <div class="stat-card">
            <small>${escapeHtml(dict.bankNextInterest)}</small>
            <b>+${nextInterest} Coin</b>
            <span>${lang === 'en' ? '3% compounded daily' : 'Bunga 3% per hari'}</span>
          </div>
          <div class="stat-card">
            <small>${escapeHtml(dict.bankResetCountdown)}</small>
            <b id="bank-wib-countdown">${formatCountdownHms(wib.secondsUntilNextNoonWib)}</b>
            <span>WIB: ${escapeHtml(wib.wibTimeString)}</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <form id="bank-deposit-form" class="guide-section" style="margin:0">
            <b>⬆️ ${escapeHtml(dict.bankDepositBtn)}</b>
            <label class="phase2-field">${escapeHtml(dict.bankAmountPlaceholder)}
              <input name="amount" type="number" min="1" max="${Math.max(1, inv.coins)}" value="${Math.max(1, Math.min(25, inv.coins))}" required>
            </label>
            <button type="submit" class="phase2-primary" ${inv.coins < 1 ? 'disabled' : ''}>${escapeHtml(dict.bankDepositBtn)}</button>
          </form>

          <form id="bank-withdraw-form" class="guide-section" style="margin:0">
            <b>⬇️ ${escapeHtml(dict.bankWithdrawBtn)}</b>
            <label class="phase2-field">${escapeHtml(dict.bankAmountPlaceholder)}
              <input name="amount" type="number" min="1" max="${Math.max(1, inv.bank_balance ?? 0)}" value="${Math.max(1, Math.min(25, inv.bank_balance ?? 0))}" required>
            </label>
            <button type="submit" class="phase2-primary" ${(inv.bank_balance ?? 0) < 1 ? 'disabled' : ''}>${escapeHtml(dict.bankWithdrawBtn)}</button>
          </form>
        </div>

        <b style="display:block;font-size:12px;color:#334155;margin-bottom:6px">📜 ${escapeHtml(dict.bankHistoryTitle)}</b>
        <div class="phase2-listings" style="margin-top:4px">${historyRows}</div>
      `
      );

      document.querySelector<HTMLFormElement>('#bank-deposit-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget as HTMLFormElement);
        const amount = Number(fd.get('amount'));
        try {
          localBackend.depositToBank(uid, amount, options.getPosition() ?? pos, lang);
          updateRightDock();
          showToast(
            lang === 'en'
              ? `Deposited ${amount} Coin into Rimba Bank!`
              : `Berhasil menyetor ${amount} Coin ke tabungan Bank Rimba!`
          );
          void openFacilityById('bank');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      });

      document.querySelector<HTMLFormElement>('#bank-withdraw-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget as HTMLFormElement);
        const amount = Number(fd.get('amount'));
        try {
          localBackend.withdrawFromBank(uid, amount, options.getPosition() ?? pos, lang);
          updateRightDock();
          showToast(
            lang === 'en'
              ? `Withdrew ${amount} Coin from Rimba Bank!`
              : `Berhasil menarik ${amount} Coin dari Bank Rimba!`
          );
          void openFacilityById('bank');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      });
      return;
    }

    if (facilityId === 'academy') {
      modal(
        dict.comingSoonBadge,
        dict.academyTitle,
        `
        <p class="phase2-copy">${escapeHtml(dict.academyDesc)}</p>
        <div class="phase2-listing" style="background:#f3e8ff;border-color:#c084fc">
          <span>
            <b>✨ ${escapeHtml(dict.comingSoonBadge)} — Fase 5</b>
            <small>${lang === 'en' ? 'Elemental magic training will unlock after level progression and combat balancing are finalized.' : 'Pelatihan sihir elemen akan dibuka setelah sistem level dan keseimbangan pertarungan selesai pada Fase 5.'}</small>
          </span>
        </div>
      `
      );
      return;
    }

    if (facilityId === 'balaikota') {
      modal(
        'CENTRAL • ZONA AMAN',
        dict.townHallTitle,
        `
        <p class="phase2-copy">${escapeHtml(dict.townHallDesc)}</p>
        <div class="phase2-listing" style="margin-bottom:12px;background:#f5efe0">
          <span>
            <b>${lang === 'en' ? 'Residency Status' : 'Status Kependudukan'}: ${char.residence_status} (60% AFK Efficiency)</b>
            <small>${lang === 'en' ? 'Citizen No.' : 'No. Warga'}: #${formatCitizenNumber(char.citizen_number)} · ${lang === 'en' ? 'Forms Owned' : 'Formulir Dimiliki'}: ${inv.data_forms}</small>
          </span>
          ${
            char.residence_status === 'Penduduk'
              ? `<button type="button" disabled>${lang === 'en' ? 'Permanent Resident' : 'Sudah Penduduk'}</button>`
              : `<button type="button" id="th-upgrade-btn">${lang === 'en' ? `Upgrade · ${GAME_CONFIG.PENDUDUK_UPGRADE_COST} coins` : `Jadi Penduduk · ${GAME_CONFIG.PENDUDUK_UPGRADE_COST} koin`}</button>`
          }
        </div>
        <form id="th-identity-form">
          <label class="phase2-field">${dict.charNameLabel}
            <input name="name" required minlength="2" maxlength="20" value="${escapeHtml(char.display_name)}">
          </label>
          <label class="phase2-field">${dict.charAgeLabel}
            <input name="age" type="number" required min="18" max="99" value="${char.age}">
          </label>
          <label class="phase2-field">${dict.charBioLabel}
            <input name="bio" maxlength="120" value="${escapeHtml(char.bio)}">
          </label>
          <button class="phase2-primary" type="submit">
            ${lang === 'en' ? 'Update Citizen ID (Consumes 1 Data Change Form)' : 'Simpan Perubahan KTP (Gunakan 1 Formulir)'}
          </button>
        </form>
      `
      );

      const upBtn = document.querySelector<HTMLButtonElement>('#th-upgrade-btn');
      if (upBtn) {
        upBtn.onclick = () => {
          try {
            const updated = localBackend.upgradeToPenduduk(uid, pos, lang);
            options.onCharacterUpdated(updated);
            updateRightDock();
            showToast(lang === 'en' ? 'Upgraded to permanent Resident!' : 'Berhasil menjadi Penduduk tetap!');
            void openFacilityById('balaikota');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      }

      document.querySelector<HTMLFormElement>('#th-identity-form')!.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget as HTMLFormElement);
        try {
          const updated = localBackend.updateIdentityAtBalaiKota(
            uid,
            String(fd.get('name')),
            Number(fd.get('age')),
            String(fd.get('bio') ?? ''),
            pos,
            lang
          );
          if (client) {
            try {
              await client.rpc('update_character_identity', {
                p_display_name: updated.display_name,
                p_age: updated.age,
                p_bio: updated.bio,
              });
            } catch {
              // Ignore cloud sync error when local backend already updated
            }
          }
          options.onCharacterUpdated(updated);
          updateRightDock();
          showToast(
            lang === 'en'
              ? `Citizen ID updated to "${updated.display_name}" (Citizen #${formatCitizenNumber(updated.citizen_number)} unchanged).`
              : `Data KTP diperbarui menjadi "${updated.display_name}" (No. Warga #${formatCitizenNumber(updated.citizen_number)} tetap).`
          );
          void openFacilityById('balaikota');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      });
      return;
    }

    if (facilityId === 'rumahsakit') {
      modal(
        'CENTRAL • MEDIS',
        dict.hospitalTitle,
        `
        <p class="phase2-copy">${escapeHtml(dict.hospitalDesc)}</p>
        <div class="phase2-listing">
          <span>
            <b>HP: ${inv.hp}/${inv.max_hp} · Stamina: ${inv.stamina}/${inv.max_stamina}</b>
            <small>${
              dead.active
                ? lang === 'en'
                  ? `Cooldown remaining: ${dead.remainingSec}s`
                  : `Sisa cooldown kematian: ${dead.remainingSec} detik`
                : dead.readyToRevive
                  ? dict.deathReadyBanner
                  : lang === 'en'
                    ? 'Medical staff ready to treat you.'
                    : 'Tim medis siap memulihkan kondisimu.'
            }</small>
          </span>
          <button type="button" id="hosp-heal-btn" ${dead.active ? 'disabled' : ''}>
            ${
              dead.readyToRevive
                ? dict.deathReviveBtn
                : lang === 'en'
                  ? `Treat HP · ${GAME_CONFIG.CLINIC_HEAL_COST} coins`
                  : `Rawat Medis · ${GAME_CONFIG.CLINIC_HEAL_COST} koin`
            }
          </button>
        </div>
      `
      );
      document.querySelector<HTMLButtonElement>('#hosp-heal-btn')!.onclick = () => {
        try {
          if (dead.readyToRevive) {
            localBackend.reviveCharacterAtHospital(uid, lang);
            options.setPosition(34, 28);
          } else {
            localBackend.healAtClinic(uid, lang);
          }
          updateRightDock();
          showToast(lang === 'en' ? 'Health fully restored at Central Hospital!' : 'Kesehatan pulih sepenuhnya di Rumah Sakit Central!');
          void openFacilityById('rumahsakit');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      };
      return;
    }

    if (facilityId === 'pasar') {
      let listings: Listing[] = localBackend.getOpenListings();
      if (client) {
        try {
          const { data } = await client
            .from('market_listings')
            .select('id,seller_id,resource_type,quantity,unit_price,status,created_at')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(25);
          if (data && data.length > 0) listings = data as Listing[];
        } catch {
          // Local listings fallback
        }
      }

      const resLabel = (r: 'wood' | 'stone' | 'fish') =>
        lang === 'en'
          ? r === 'wood'
            ? 'Wood'
            : r === 'stone'
              ? 'Stone'
              : 'Fish'
          : r === 'wood'
            ? 'Kayu'
            : r === 'stone'
              ? 'Batu'
              : 'Ikan';

      const rows = listings
        .map(
          l => `
        <div class="phase2-listing">
          <span>
            <b>${l.quantity} ${resLabel(l.resource_type)}</b>
            <small>${l.unit_price} ${lang === 'en' ? 'coins/unit · Seller:' : 'koin/unit · Penjual:'} ${escapeHtml(l.seller_name ?? 'Warga')}</small>
          </span>
          ${
            l.seller_id === uid
              ? `<button type="button" data-cancel="${escapeHtml(l.id)}">${lang === 'en' ? 'Cancel' : 'Batalkan'}</button>`
              : `<button type="button" data-buy="${escapeHtml(l.id)}">${lang === 'en' ? 'Buy' : 'Beli'} · ${l.quantity * l.unit_price}</button>`
          }
        </div>
      `
        )
        .join('');

      modal(
        'CENTRAL • EKONOMI',
        dict.marketTitle,
        `
        <p class="phase2-copy">${escapeHtml(dict.marketDesc)}</p>
        <div class="phase2-listing" style="margin-bottom:8px;background:#f0fdf4;border-color:#86efac">
          <span>
            <b>🪱 ${escapeHtml(dict.itemBaitName)}</b>
            <small>${lang === 'en' ? `In bag: ${inv.fish_bait ?? 0} bait · Required for active & AFK fishing` : `Di tas: ${inv.fish_bait ?? 0} umpan · Wajib untuk memancing aktif & AFK`}</small>
          </span>
          <button type="button" id="mkt-buy-bait">${escapeHtml(dict.buyBaitPackBtn)} · ${GAME_CONFIG.FISH_BAIT_PACK_PRICE}</button>
        </div>
        <div class="phase2-listing" style="margin-bottom:10px;background:#f5efe0">
          <span>
            <b>${lang === 'en' ? 'Data Change Form (Town Hall Document)' : 'Formulir Perubahan Data KTP'}</b>
            <small>${lang === 'en' ? `Owned: ${inv.data_forms}` : `Dimiliki: ${inv.data_forms} lembar`}</small>
          </span>
          <button type="button" id="mkt-buy-form">${lang === 'en' ? 'Buy' : 'Beli'} · ${GAME_CONFIG.DATA_FORM_PRICE}</button>
        </div>
        <div class="phase2-listing" style="margin-bottom:12px">
          <span>
            <b>${lang === 'en' ? 'Instant Sell to Central Cooperative' : 'Jual Cepat ke Koperasi Central'}</b>
            <small>${lang === 'en' ? 'Wood: 3c · Stone: 5c · Fish: 6c' : 'Kayu: 3 koin · Batu: 5 koin · Ikan: 6 koin'}</small>
          </span>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button type="button" data-sell-npc="wood">${lang === 'en' ? 'Sell 3 Wood (+9)' : 'Jual 3 Kayu (+9)'}</button>
            <button type="button" data-sell-npc="stone">${lang === 'en' ? 'Sell 2 Stone (+10)' : 'Jual 2 Batu (+10)'}</button>
            <button type="button" data-sell-npc="fish">${lang === 'en' ? 'Sell 2 Fish (+12)' : 'Jual 2 Ikan (+12)'}</button>
          </div>
        </div>
        <form id="mkt-list-form" class="phase2-form">
          <label class="phase2-field">${lang === 'en' ? 'Resource' : 'Barang'}
            <select name="resource">
              <option value="wood">${resLabel('wood')} (${inv.wood})</option>
              <option value="stone">${resLabel('stone')} (${inv.stone})</option>
              <option value="fish">${resLabel('fish')} (${inv.fish})</option>
            </select>
          </label>
          <label class="phase2-field">${lang === 'en' ? 'Quantity' : 'Jumlah'}
            <input name="quantity" type="number" min="1" max="1000" value="3" required>
          </label>
          <label class="phase2-field">${lang === 'en' ? 'Unit Price (Coins)' : 'Harga / Unit (Koin)'}
            <input name="price" type="number" min="1" max="100000" value="5" required>
          </label>
          <div class="phase2-field" style="justify-content:end">
            <button class="phase2-primary" type="submit" style="margin:0;height:38px">${lang === 'en' ? 'Post Listing' : 'Pasang Penawaran'}</button>
          </div>
        </form>
        <div class="phase2-listings">${rows}</div>
      `
      );

      document.querySelector<HTMLButtonElement>('#mkt-buy-bait')!.onclick = () => {
        try {
          localBackend.buyFishingBait(uid, lang);
          updateRightDock();
          showToast(
            lang === 'en'
              ? `Purchased +${GAME_CONFIG.FISH_BAIT_PACK_QTY} Lake Fishing Bait!`
              : `Membeli +${GAME_CONFIG.FISH_BAIT_PACK_QTY} Umpan Pancing Danau!`
          );
          void openFacilityById('pasar');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      };

      document.querySelector<HTMLButtonElement>('#mkt-buy-form')!.onclick = () => {
        try {
          localBackend.buyDataForm(uid, lang);
          updateRightDock();
          showToast(lang === 'en' ? 'Purchased 1 Data Change Form.' : 'Membeli 1 Formulir Perubahan Data.');
          void openFacilityById('pasar');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      };

      document.querySelectorAll<HTMLButtonElement>('[data-sell-npc]').forEach(btn => {
        btn.onclick = () => {
          const r = btn.dataset.sellNpc as 'wood' | 'stone' | 'fish';
          const qty = r === 'wood' ? 3 : 2;
          try {
            const { coinsEarned } = localBackend.sellToCentralMerchant(uid, r, qty, lang);
            updateRightDock();
            showToast(lang === 'en' ? `Sold ${qty} ${r} for +${coinsEarned} coins.` : `Berhasil menjual ${qty} unit (+${coinsEarned} koin).`);
            void openFacilityById('pasar');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });

      document.querySelector<HTMLFormElement>('#mkt-list-form')!.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget as HTMLFormElement);
        try {
          localBackend.createMarketListing(
            uid,
            String(fd.get('resource')) as 'wood' | 'stone' | 'fish',
            Number(fd.get('quantity')),
            Number(fd.get('price')),
            lang
          );
          updateRightDock();
          showToast(lang === 'en' ? 'Listing posted to Market escrow.' : 'Penawaran dipasang di escrow Pasar.');
          void openFacilityById('pasar');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      });

      document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(btn => {
        btn.onclick = () => {
          try {
            localBackend.buyMarketListing(uid, btn.dataset.buy!, lang);
            updateRightDock();
            showToast(lang === 'en' ? 'Purchase complete!' : 'Pembelian berhasil!');
            void openFacilityById('pasar');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });

      document.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach(btn => {
        btn.onclick = () => {
          try {
            localBackend.cancelMarketListing(uid, btn.dataset.cancel!);
            updateRightDock();
            showToast(lang === 'en' ? 'Listing cancelled & items returned.' : 'Penawaran dibatalkan & barang kembali ke tas.');
            void openFacilityById('pasar');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });
      return;
    }

    if (facilityId === 'pakaian') {
      const itemsHtml = OUTFIT_CATALOG.map(item => {
        const owned = inv.owned_outfits.includes(item.id);
        const equipped = char.outfit_id === item.id || char.hat_id === item.id;
        const name = lang === 'en' ? item.name_en : item.name_id;
        const desc = lang === 'en' ? item.desc_en : item.desc_id;
        return `
          <div class="phase2-listing">
            <span>
              <b><i style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${item.color === 'transparent' ? '#cbd5e1' : item.color};margin-right:7px"></i>${escapeHtml(name)}</b>
              <small>${escapeHtml(desc)}</small>
            </span>
            <button type="button" data-boutique="${escapeHtml(item.id)}" ${equipped ? 'disabled' : ''}>
              ${equipped ? dict.invEquipped : owned ? dict.invEquip : `${lang === 'en' ? 'Buy' : 'Beli'} · ${item.price}`}
            </button>
          </div>
        `;
      }).join('');

      modal(
        'CENTRAL • BUSANA',
        dict.boutiqueTitle,
        `<p class="phase2-copy">${escapeHtml(dict.boutiqueDesc)}</p><div class="phase2-listings">${itemsHtml}</div>`
      );

      document.querySelectorAll<HTMLButtonElement>('[data-boutique]').forEach(btn => {
        btn.onclick = () => {
          try {
            const { character: updated } = localBackend.buyOrEquipOutfit(uid, btn.dataset.boutique!, lang);
            options.onCharacterUpdated(updated);
            updateRightDock();
            showToast(lang === 'en' ? 'Appearance updated!' : 'Penampilan karakter diperbarui!');
            void openFacilityById('pakaian');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });
      return;
    }

    if (facilityId === 'ibadah') {
      const optionsHtml = WORSHIP_OPTIONS.map(
        opt => `
        <div class="phase2-listing">
          <span>
            <b>${escapeHtml(lang === 'en' ? opt.label_en : opt.label_id)}</b>
            <small>${escapeHtml(lang === 'en' ? opt.desc_en : opt.desc_id)}</small>
          </span>
          <button type="button" data-worship="${escapeHtml(opt.id)}">
            ${lang === 'en' ? 'Pray / Reflect' : 'Berdoa / Hening'}
          </button>
        </div>
      `
      ).join('');

      modal(
        'CENTRAL • HARMONI',
        dict.sanctuaryTitle,
        `<p class="phase2-copy">${escapeHtml(dict.sanctuaryDesc)}</p><div class="phase2-listings">${optionsHtml}</div>`
      );

      document.querySelectorAll<HTMLButtonElement>('[data-worship]').forEach(btn => {
        btn.onclick = () => {
          try {
            const { label } = localBackend.prayAtSanctuary(uid, btn.dataset.worship!, pos, lang);
            updateRightDock();
            showToast(
              lang === 'en'
                ? `${label} completed peacefully (+35 Stamina, +15 HP).`
                : `${label} selesai dengan damai (+35 Stamina, +15 HP).`
            );
            closeModal();
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });
      return;
    }

    if (facilityId === 'kuliner') {
      modal(
        'CENTRAL • KULINER',
        dict.foodStallTitle,
        `
        <p class="phase2-copy">${escapeHtml(dict.foodStallDesc)}</p>
        <div class="phase2-listings">
          <div class="phase2-listing">
            <span>
              <b>${lang === 'en' ? 'Rimba Rice Ration (+45 Stamina, +10 HP)' : 'Bekal Nasi Rimba (+45 Stamina, +10 HP)'}</b>
              <small>${lang === 'en' ? `In bag: ${inv.food_rations}` : `Di tas: ${inv.food_rations} porsi`}</small>
            </span>
            <div style="display:flex;gap:6px">
              <button type="button" data-buy-food="food">${lang === 'en' ? 'Buy' : 'Beli'} · ${GAME_CONFIG.FOOD_PRICE}</button>
              <button type="button" data-eat-food="food" ${inv.food_rations < 1 ? 'disabled' : ''}>${dict.invUse}</button>
            </div>
          </div>
          <div class="phase2-listing">
            <span>
              <b>${lang === 'en' ? 'Forest Herbal Tea (+30 Stamina)' : 'Teh Herba Hutan (+30 Stamina)'}</b>
              <small>${lang === 'en' ? `In bag: ${inv.herbal_tea}` : `Di tas: ${inv.herbal_tea} botol`}</small>
            </span>
            <div style="display:flex;gap:6px">
              <button type="button" data-buy-food="tea">${lang === 'en' ? 'Buy' : 'Beli'} · ${GAME_CONFIG.TEA_PRICE}</button>
              <button type="button" data-eat-food="tea" ${inv.herbal_tea < 1 ? 'disabled' : ''}>${dict.invUse}</button>
            </div>
          </div>
          <div class="phase2-listing">
            <span>
              <b>${lang === 'en' ? 'Grilled Lake Fish (+65 Stamina, +25 HP)' : 'Ikan Bakar Danau (+65 Stamina, +25 HP)'}</b>
              <small>${lang === 'en' ? `In bag: ${inv.grilled_fish}` : `Di tas: ${inv.grilled_fish} porsi`}</small>
            </span>
            <div style="display:flex;gap:6px">
              <button type="button" data-buy-food="fish_meal">${lang === 'en' ? 'Buy' : 'Beli'} · ${GAME_CONFIG.GRILLED_FISH_PRICE}</button>
              <button type="button" data-eat-food="fish_meal" ${inv.grilled_fish < 1 ? 'disabled' : ''}>${dict.invUse}</button>
            </div>
          </div>
          <div class="phase2-listing" style="background:#f0fdf4">
            <span>
              <b>🪱 ${escapeHtml(dict.itemBaitName)}</b>
              <small>${lang === 'en' ? `In bag: ${inv.fish_bait ?? 0} bait` : `Di tas: ${inv.fish_bait ?? 0} umpan`}</small>
            </span>
            <button type="button" id="tavern-buy-bait">${escapeHtml(dict.buyBaitPackBtn)} · ${GAME_CONFIG.FISH_BAIT_PACK_PRICE}</button>
          </div>
        </div>
      `
      );

      document.querySelector<HTMLButtonElement>('#tavern-buy-bait')!.onclick = () => {
        try {
          localBackend.buyFishingBait(uid, lang);
          updateRightDock();
          showToast(
            lang === 'en'
              ? `Purchased +${GAME_CONFIG.FISH_BAIT_PACK_QTY} Lake Fishing Bait!`
              : `Membeli +${GAME_CONFIG.FISH_BAIT_PACK_QTY} Umpan Pancing Danau!`
          );
          void openFacilityById('kuliner');
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      };

      document.querySelectorAll<HTMLButtonElement>('[data-buy-food]').forEach(btn => {
        btn.onclick = () => {
          try {
            localBackend.buyConsumable(uid, btn.dataset.buyFood as 'food' | 'tea' | 'fish_meal', lang);
            updateRightDock();
            void openFacilityById('kuliner');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });

      document.querySelectorAll<HTMLButtonElement>('[data-eat-food]').forEach(btn => {
        btn.onclick = () => {
          try {
            localBackend.consumeItem(uid, btn.dataset.eatFood as 'food' | 'tea' | 'fish_meal', lang);
            updateRightDock();
            showToast(lang === 'en' ? 'Stamina replenished!' : 'Stamina berhasil dipulihkan!');
            void openFacilityById('kuliner');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });
      return;
    }

    if (facilityId === 'penginapan') {
      const occupancy = localBackend.getRoomOccupancy();
      const tiersHtml = ROOM_TIERS.map(tier => {
        const used = occupancy[tier.id] ?? 0;
        const avail = Math.max(0, tier.capacity - used);
        const name = lang === 'en' ? tier.name_en : tier.name_id;
        const desc = lang === 'en' ? tier.desc_en : tier.desc_id;
        return `
          <div class="phase2-listing" style="flex-direction:column;align-items:stretch">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <b>${escapeHtml(name)}</b>
              <small style="font-weight:700;color:#0f766e">${lang === 'en' ? `Available: ${avail}/${tier.capacity} units` : `Tersedia: ${avail}/${tier.capacity} kamar`}</small>
            </div>
            <small>${escapeHtml(desc)}</small>
            <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
              <button type="button" data-rent-tier="${tier.id}" data-rent-hours="6" ${avail < 1 || Boolean(inv.active_room) ? 'disabled' : ''}>
                6 ${lang === 'en' ? 'Hours' : 'Jam'} · ${tier.base_price_per_6h} ${lang === 'en' ? 'coins' : 'koin'}
              </button>
              <button type="button" data-rent-tier="${tier.id}" data-rent-hours="24" ${avail < 1 || Boolean(inv.active_room) ? 'disabled' : ''}>
                1 ${lang === 'en' ? 'Day' : 'Hari'} · ${Math.round(tier.base_price_per_6h * 3.5)} ${lang === 'en' ? 'coins' : 'koin'}
              </button>
              <button type="button" data-rent-tier="${tier.id}" data-rent-hours="72" ${avail < 1 || Boolean(inv.active_room) ? 'disabled' : ''}>
                3 ${lang === 'en' ? 'Days' : 'Hari'} · ${Math.round(tier.base_price_per_6h * 9)} ${lang === 'en' ? 'coins' : 'koin'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      const activeBanner = inv.active_room
        ? `<div class="phase2-listing" style="margin-bottom:10px;background:#ecfdf5;border-color:#6ee7b7">
            <span>
              <b>🔑 ${lang === 'en' ? 'Active Room Key:' : 'Kunci Kamar Aktif:'} ${escapeHtml(lang === 'en' ? inv.active_room.tier_name_en : inv.active_room.tier_name_id)} (#${escapeHtml(inv.active_room.room_number)})</b>
              <small>${lang === 'en' ? 'Valid until:' : 'Berlaku sampai:'} ${escapeHtml(new Date(inv.active_room.expires_at).toLocaleString())}</small>
            </span>
          </div>`
        : '';

      modal(
        'CENTRAL • HUNIAN SEWA',
        dict.innTitle,
        `
        <p class="phase2-copy">${escapeHtml(dict.innDesc)}</p>
        ${activeBanner}
        <div class="phase2-listings">${tiersHtml}</div>
        <p class="phase2-note">${lang === 'en' ? 'Note: Initial room rates and durations are configurable for gameplay balancing.' : 'Catatan: Harga sewa dan durasi awal disimpan dalam konfigurasi agar dapat diseimbangkan.'}</p>
      `
      );

      document.querySelectorAll<HTMLButtonElement>('[data-rent-tier]').forEach(btn => {
        btn.onclick = () => {
          const tierId = btn.dataset.rentTier as 'basic' | 'comfort' | 'suite';
          const hours = Number(btn.dataset.rentHours) as 6 | 24 | 72;
          try {
            const { rental, totalCost } = localBackend.rentRoom(uid, tierId, hours, pos, lang);
            updateRightDock();
            showToast(
              lang === 'en'
                ? `Booked room #${rental.room_number} for ${hours}h (-${totalCost} coins)!`
                : `Berhasil menyewa kamar #${rental.room_number} selama ${hours} jam (-${totalCost} koin)!`
            );
            void openFacilityById('penginapan');
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        };
      });
      return;
    }

    if (facilityId === 'dungeon1' || facilityId === 'dungeon2' || facilityId === 'arena') {
      const inD1 = isDungeon1Tile(Math.round(pos.x), Math.round(pos.y));
      const inD2 = isDungeon2Tile(Math.round(pos.x), Math.round(pos.y));
      const inAr = isArenaTile(Math.round(pos.x), Math.round(pos.y));

      if (facilityId === 'arena') {
        modal(
          lang === 'en' ? 'PHYSICAL PVP ZONE • ARENA' : 'ZONA FISIK PVP • ARENA',
          lang === 'en' ? 'Colosseum PvP Arena (Northeast)' : 'Colosseum Arena PvP (Timur Laut)',
          `
          <p class="phase2-copy">
            ${
              lang === 'en'
                ? 'Arena is a physical map zone, not a menu button that deducts HP. Walking inside the Arena circle automatically activates PvP = ON. Leaving the Arena immediately sets PvP = OFF.'
                : 'Arena adalah zona fisik di map, bukan tombol menu yang langsung mengurangi HP. Saat karakter masuk ke area Arena, status berubah menjadi PvP = ON. Saat keluar dari area Arena, status kembali ke PvP = OFF.'
            }
          </p>
          <div class="phase2-listing" style="background:${inAr ? '#fef2f2' : '#f0fdf4'};border-color:${inAr ? '#fca5a5' : '#86efac'}">
            <span>
              <b>${inAr ? `⚔️ ${escapeHtml(dict.pvpStatusOn)}` : `🛡️ ${escapeHtml(dict.pvpStatusOff)}`}</b>
              <small>${
                lang === 'en'
                  ? 'Use WASD or Left-click to move inside the Arena and press [Space] when another active player is in range.'
                  : 'Gunakan WASD atau Klik Kiri untuk masuk ke lingkaran Arena dan tekan [Spasi] saat pemain lawan berada dalam jangkauan.'
              }</small>
            </span>
          </div>
        `
        );
        return;
      }

      const isUpper = facilityId === 'dungeon1';
      modal(
        lang === 'en' ? 'DUNGEON ZONE • SPACEBAR COMBAT' : 'ZONA DUNGEON • PERTARUNGAN SPASI',
        isUpper
          ? lang === 'en'
            ? 'Upper Dungeon — Slime Cavern'
            : 'Dungeon Atas — Gua Slime'
          : lang === 'en'
            ? 'Lower Dungeon — Goblin Ruins'
            : 'Dungeon Bawah — Reruntuhan Goblin',
        `
        <p class="phase2-copy">
          ${
            isUpper
              ? lang === 'en'
                ? 'Upper Dungeon is inhabited exclusively by Slimes. Walk near a Slime on the map and press [Space] to attack. Pressing attack does NOT reduce your HP—your HP only drops if a Slime chases you and counterattacks within its attack range.'
                : 'Dungeon Atas hanya dihuni oleh monster Slime. Dekati Slime di peta lalu tekan tombol [Spasi] untuk menyerang. Menekan tombol serang TIDAK mengurangi HP pemain—HP hanya berkurang jika Slime mengejar dan membalas serangan dalam jarak serangnya.'
              : lang === 'en'
                ? 'Lower Dungeon is inhabited exclusively by Goblins. Walk near a Goblin on the map and press [Space] to attack. Pressing attack does NOT reduce your HP—your HP only drops if a Goblin chases you and counterattacks within its attack range.'
                : 'Dungeon Bawah hanya dihuni oleh monster Goblin. Dekati Goblin di peta lalu tekan tombol [Spasi] untuk menyerang. Menekan tombol serang TIDAK mengurangi HP pemain—HP hanya berkurang jika Goblin mengejar dan membalas serangan dalam jarak serangnya.'
          }
        </p>
        <div class="phase2-listing" style="background:#f5efe0">
          <span>
            <b>${isUpper ? '🟢 Slime (HP 45 · Counterattack -8 HP)' : '👺 Goblin (HP 75 · Counterattack -14 HP)'}</b>
            <small>${
              lang === 'en'
                ? `Reward per defeat: +${isUpper ? 22 : 38} Coin & +${isUpper ? 1 : 2} Crystal Shard · Status: ${inD1 || inD2 ? 'Inside Dungeon' : 'Walk into Dungeon tiles to fight'}`
                : `Hadiah kalahkan monster: +${isUpper ? 22 : 38} Coin & +${isUpper ? 1 : 2} Pecahan Kristal · Status: ${inD1 || inD2 ? 'Di dalam Dungeon' : 'Masuk ke lantai Dungeon untuk bertarung'}`
            }</small>
          </span>
        </div>
      `
      );
    }
  };

  // --- CONTEXTUAL INTERACTION (Key F or Context Pill Click) ---
  const findNearestInteractable = ():
    | { kind: 'work_node'; node: WorkNode; dist: number }
    | { kind: 'facility'; facility: FacilityLandmark; dist: number }
    | null => {
    const pos = options.getPosition();
    if (!pos) return null;

    let bestWork: { node: WorkNode; dist: number } | null = null;
    for (const node of localBackend.getWorkNodes()) {
      const d = Math.hypot(node.tile_x - pos.x, node.tile_y - pos.y);
      if (d <= GAME_CONFIG.INTERACT_RANGE_TILES && (!bestWork || d < bestWork.dist)) {
        bestWork = { node, dist: d };
      }
    }
    if (bestWork) return { kind: 'work_node', node: bestWork.node, dist: bestWork.dist };

    let bestFac: { facility: FacilityLandmark; dist: number } | null = null;
    for (const fac of WORLD_FACILITIES) {
      if (fac.id === 'work_wood' || fac.id === 'work_stone' || fac.id === 'fishing_lake') continue;
      const d = Math.hypot(fac.tx - pos.x, fac.ty - pos.y);
      if (d <= 4.4 && (!bestFac || d < bestFac.dist)) {
        bestFac = { facility: fac, dist: d };
      }
    }
    if (bestFac) return { kind: 'facility', facility: bestFac.facility, dist: bestFac.dist };

    return null;
  };

  const triggerContextualAction = () => {
    notifyPlayerInput();
    const lang = options.getLang();
    const uid = options.getUserId();
    if (!uid || !options.hasCharacter()) {
      showToast(t().spectatorBanner);
      options.openCharacterCreator();
      return;
    }

    const dead = getDeathState();
    if (dead.locked) {
      showToast(dead.readyToRevive ? t().deathReadyBanner : t().deathBannerSub);
      return;
    }

    const pos = options.getPosition() ?? GAME_CONFIG.CENTRAL_SPAWN;
    const nearest = findNearestInteractable();

    if (!nearest) {
      showToast(
        lang === 'en'
          ? 'Walk closer to a Central facility (Market, Bank, Hospital, Inn) or a Work Area resource node, then press [F].'
          : 'Berjalanlah mendekati bangunan fasilitas Central (Pasar, Bank, RS, Penginapan) atau objek di Area Kerja, lalu tekan [F].'
      );
      return;
    }

    if (nearest.kind === 'work_node') {
      try {
        const res = localBackend.gatherWorkResource(uid, pos, lang);
        updateRightDock();
        showToast(
          lang === 'en'
            ? `+${res.amount} ${res.resource} gathered from ${res.nodeName} (${res.remaining} left · Stamina ${res.stamina}${res.resource === 'fish' ? ` · Bait ${res.fishBaitLeft}` : ''}).`
            : `+${res.amount} ${res.resource === 'wood' ? 'kayu' : res.resource === 'stone' ? 'batu' : 'ikan'} dari ${res.nodeName} (sisa ${res.remaining} · Stamina ${res.stamina}${res.resource === 'fish' ? ` · Umpan ${res.fishBaitLeft}` : ''}).`
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    void openFacilityById(nearest.facility.id);
  };

  // --- WIRE BUTTONS & KEYBOARD SHORTCUTS (F and E) ---
  document.querySelector<HTMLButtonElement>('#dock-ktp-btn')!.onclick = () => {
    notifyPlayerInput();
    if (!options.hasCharacter()) {
      options.openCharacterCreator();
    } else {
      options.openKtpModal();
    }
  };

  document.querySelector<HTMLButtonElement>('#dock-inv-btn')!.onclick = toggleInventoryModal;
  document.querySelector<HTMLButtonElement>('#dock-afk-vault-btn')!.onclick = () => {
    notifyPlayerInput();
    openAfkVaultModal();
  };
  document.querySelector<HTMLButtonElement>('#dock-world-btn')!.onclick = () => openWorldInfoModal('region');
  document.querySelector<HTMLButtonElement>('#world-info-btn')!.onclick = () => openWorldInfoModal('region');
  document.querySelector<HTMLButtonElement>('#guide-btn')!.onclick = openGuideModal;
  document.querySelector<HTMLButtonElement>('#context-interact-pill')!.onclick = triggerContextualAction;

  const triggerHotbarSword = () => {
    notifyPlayerInput();
    window.dispatchEvent(new CustomEvent('rimba-trigger-sword-swing'));
  };

  const triggerHotbarConsumable = (itemType: 'food' | 'tea') => {
    notifyPlayerInput();
    const uid = options.getUserId();
    const lang = options.getLang();
    if (!uid || !options.hasCharacter()) {
      showToast(t().spectatorBanner);
      options.openCharacterCreator();
      return;
    }
    try {
      localBackend.consumeItem(uid, itemType, lang);
      updateRightDock();
      showToast(lang === 'en' ? 'Stamina & HP replenished!' : 'Stamina & HP berhasil dipulihkan!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  document.querySelector<HTMLButtonElement>('#hotbar-slot-1')!.onclick = triggerHotbarSword;
  document.querySelector<HTMLButtonElement>('#hotbar-slot-2')!.onclick = () => triggerHotbarConsumable('food');
  document.querySelector<HTMLButtonElement>('#hotbar-slot-3')!.onclick = () => triggerHotbarConsumable('tea');
  document.querySelector<HTMLButtonElement>('#hotbar-slot-4')!.onclick = triggerContextualAction;
  document.querySelector<HTMLButtonElement>('#hotbar-slot-pan')!.onclick = () => {
    window.dispatchEvent(new CustomEvent('rimba-toggle-pan-mode'));
  };

  document.querySelector<HTMLButtonElement>('#session-reclaim-btn')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('rimba-reclaim-session'));
  });

  window.addEventListener('rimba-sword-swung', event => {
    const cdMs = (event as CustomEvent<{ cooldownMs?: number }>).detail?.cooldownMs ?? STARTER_SWORD_SPEC.cooldown_ms;
    const slot1 = document.querySelector<HTMLElement>('#hotbar-slot-1');
    const cdOverlay = document.querySelector<HTMLElement>('#hotbar-sword-cd');
    if (slot1) {
      slot1.classList.add('swing-flash');
      window.setTimeout(() => slot1.classList.remove('swing-flash'), 220);
    }
    if (cdOverlay) {
      cdOverlay.style.transition = 'none';
      cdOverlay.style.transform = 'scaleY(1)';
      void cdOverlay.offsetHeight;
      cdOverlay.style.transition = `transform ${cdMs}ms linear`;
      cdOverlay.style.transform = 'scaleY(0)';
    }
  });

  window.addEventListener('rimba-pan-mode-changed', event => {
    const active = Boolean((event as CustomEvent<{ active: boolean }>).detail?.active);
    const panBtn = document.querySelector<HTMLButtonElement>('#hotbar-slot-pan');
    if (panBtn) panBtn.classList.toggle('pan-active', active);
  });

  window.addEventListener('keydown', event => {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
    ) {
      return;
    }
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      toggleInventoryModal();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      triggerContextualAction();
    } else if (event.key === '1') {
      event.preventDefault();
      triggerHotbarSword();
    } else if (event.key === '2') {
      event.preventDefault();
      triggerHotbarConsumable('food');
    } else if (event.key === '3') {
      event.preventDefault();
      triggerHotbarConsumable('tea');
    }
  });

  window.addEventListener('rimba-open-facility', event => {
    const facId = (event as CustomEvent<{ id: FacilityLandmark['id'] }>).detail?.id;
    if (facId) void openFacilityById(facId);
  });

  window.addEventListener('rimba-open-world-info', event => {
    const tab = (event as CustomEvent<{ tab?: 'region' | 'news' | 'creator' }>).detail?.tab ?? 'region';
    openWorldInfoModal(tab);
  });

  window.addEventListener('rimba-afk-report', event => {
    const report = (event as CustomEvent<{ report: AfkSessionReport }>).detail?.report;
    if (report) {
      updateRightDock();
      openAfkVaultModal(report);
    }
  });

  window.addEventListener('rimba-toast', event => {
    const message = (event as CustomEvent<{ message: string }>).detail?.message;
    if (message) {
      updateRightDock();
      showToast(message, 4600);
    }
  });

  window.addEventListener('rimba-gather-node', () => {
    triggerContextualAction();
  });

  window.addEventListener('character-change', () => {
    const uid = options.getUserId();
    if (uid && options.hasCharacter()) {
      const savedPos = localBackend.getPosition(uid);
      if (savedPos) {
        options.setPosition(savedPos.tile_x, savedPos.tile_y);
      }
      const afkReport = localBackend.syncOfflineAfkToVault(uid);
      if (afkReport) {
        if (afkReport.died_in_dungeon) {
          options.setPosition(34, 28);
        }
        openAfkVaultModal(afkReport);
      }
    }
    updateRightDock();
  });

  window.addEventListener('rimba-lang-change', () => {
    updateRightDock();
  });

  // Periodic 300ms UI, Bank WIB countdown, & proximity loop
  window.setInterval(() => {
    updateRightDock();
    const lang = options.getLang();
    const dict = t();
    const pill = document.querySelector<HTMLElement>('#context-interact-pill');
    const deathOverlay = document.querySelector<HTMLElement>('#death-overlay');
    const dead = getDeathState();

    const bankCountdownEl = document.querySelector<HTMLElement>('#bank-wib-countdown');
    if (bankCountdownEl) {
      bankCountdownEl.textContent = formatCountdownHms(getWibTimeInfo().secondsUntilNextNoonWib);
    }

    if (deathOverlay) {
      const uid = options.getUserId();
      if (dead.active) {
        const mm = String(Math.floor(dead.remainingSec / 60)).padStart(2, '0');
        const ss = String(dead.remainingSec % 60).padStart(2, '0');
        deathOverlay.style.display = 'block';
        deathOverlay.innerHTML = `
          <b>⏳ ${escapeHtml(dict.deathBannerTitle)} (${mm}:${ss})</b>
          <p>${escapeHtml(dict.deathBannerSub)} (-${dead.penalty} Coin)</p>
        `;
      } else if (dead.readyToRevive && uid) {
        // Cooldown reached 00:00 — do NOT auto-revive! Wait for manual click on Bangkit / Revive button.
        deathOverlay.style.display = 'block';
        if (!deathOverlay.querySelector('#death-revive-now')) {
          deathOverlay.innerHTML = `
            <b>🏥 ${escapeHtml(dict.deathReadyBanner)}</b>
            <p>${lang === 'en' ? 'Your 10-minute recovery timer is complete. Click Revive below to return to life.' : 'Waktu pemulihan 10 menit telah selesai. Klik tombol Bangkit di bawah untuk hidup kembali.'}</p>
            <button type="button" class="phase2-primary" id="death-revive-now" style="margin-top:6px">${escapeHtml(dict.deathReviveBtn)}</button>
          `;
          const revBtn = deathOverlay.querySelector<HTMLButtonElement>('#death-revive-now');
          if (revBtn) {
            revBtn.onclick = () => {
              notifyPlayerInput();
              localBackend.reviveCharacterAtHospital(uid, lang);
              options.setPosition(34, 28);
              updateRightDock();
              deathOverlay.style.display = 'none';
              showToast(lang === 'en' ? 'Revived at Central Hospital!' : 'Berhasil bangkit kembali di Rumah Sakit Central!');
            };
          }
        }
      } else {
        deathOverlay.style.display = 'none';
      }
    }

    if (pill) {
      if (!options.hasCharacter() || dead.locked) {
        pill.style.display = 'none';
      } else {
        const nearest = findNearestInteractable();
        if (!nearest) {
          pill.style.display = 'none';
        } else {
          const label =
            nearest.kind === 'work_node'
              ? lang === 'en'
                ? nearest.node.name_en
                : nearest.node.name_id
              : lang === 'en'
                ? nearest.facility.name_en
                : nearest.facility.name_id;
          pill.style.display = 'inline-flex';
          pill.innerHTML = `<kbd>F</kbd> <span>${escapeHtml(dict.promptInteractPrefix)} <b>${escapeHtml(label)}</b></span>`;
        }
      }
    }

    // Save position periodically
    const uid = options.getUserId();
    const pos = options.getPosition();
    if (uid && options.hasCharacter() && pos) {
      localBackend.savePosition(uid, pos.x, pos.y);
    }
  }, 300);

  updateRightDock();
}
