# DESIGN.md — Rimba: Survival Town Visual, Character & HUD Specification

> **MANDATORY INSTRUCTION FOR AI AGENTS:**
> All UI, world art, character sprites, avatar framing, and HUD changes must adhere to this visual design specification so the game remains clean, cohesive, and faithful to the reference art.

---

## 1. World Art Direction: Pastel Isometric Fantasy Town

Inspired by the reference **Pastel Isometric Fantasy Town Map**:
- **Lush Meadow Greens**: Soft layered greens (`#7bc871`, `#86d17b`, `#70be67`) with subtle isometric tile outlines and warm sandy shorelines (`#f6e3b4`) bordering sky-blue water (`#56b4f5`, `#67c1fa`).
- **Central Walled Safe Zone**: Pale limestone plaza (`#e4e3ed`, `#d2d0de`) anchored by a sparkling **Crystal Fountain (`28, 28`)** and distinct architectural landmarks:
  - **Balai Kota (`28, 22`)**: Royal blue pitched roof (`#3b6cb7`) with a golden clock tower.
  - **Bank Rimba (`25, 22`)**: Warm gold-amber roof (`#b45309`) with marble columns and a golden coin crest.
  - **Rumah Sakit (`34, 27`)**: Crisp white walls with a blue roof and red medical cross.
  - **Academy (`33, 23`, `Coming Soon`)**: Lavender-violet spire (`#7e57c2`) with a glowing star crest.
  - **Pasar, Toko Pakaian, Kedai Makanan, Penginapan, Tempat Ibadah**: Warm terracotta, rose, amber, timber, and turquoise dome roofs around the plaza.

---

## 2. Chibi Pixel-Art Character Style & Unclipped KTP Avatar Framing

- **20 Selectable Models (`CHARACTER_MODELS`)**:
  - **10 Male (`male-01` .. `male-10`)** and **10 Female (`female-01` .. `female-10`)** with chunky dark pixel outlines (`#231815`), layered bangs, expressive dark eyes, rosy cheek blush, collared shirts, shorts, and shoes.
- **Unclipped KTP Avatar Framing (`renderChibiCharacterSvg`)**:
  - All SVG avatars use `viewBox="0 -2 32 40" preserveAspectRatio="xMidYMid meet"` with `.chibi-svg-avatar { width: 100%; height: 100%; object-fit: contain; display: block; }`.
  - Both the compact right-dock KTP button (`.dock-avatar-dot`, `44×50px`) and the full KTP modal card (`.ktp-avatar`, `66×76px`) include internal padding and flex centering so the character's hair/hat, head, body, and shoes are never cut off on desktop or mobile screens.

---

## 3. Overhead Name Labels, Monster Bars & Zone Indicators

- **Player Overhead Label (No NPCs in World)**:
  - Manual active control: displays `Nama` (e.g., `Dhitya`) in bold white text over `rgba(15, 23, 42, 0.78)`.
  - AFK mode (after 30s without input or simulated offline KTP citizen): displays `Nama (AFK)` (e.g., `Dhitya (AFK)`) over warm amber-brown `rgba(120, 53, 15, 0.88)`.
- **Dungeon Monster Visuals**:
  - **Upper Dungeon (`6..13, 7..14`)**: Emerald pixel-art **Slime** with overhead HP bar (`Slime (45/45)`).
  - **Lower Dungeon (`44..51, 43..50`)**: Pixel-art **Goblin** with pointed ears, wooden club, and overhead HP bar (`Goblin (75/75)`).
- **Top Bar Indicators (`.topbar`)**:
  - **Region & Population Pill (`#worldHeaderBtn`)**: `Wilayah 1 • 1 online • 18 / 25` (with tooltip noting `Visual AFK aktif: 5 dari 18 penduduk terdaftar`).
  - **PvP Zone Pill (`#pvpStatusPill`)**: `🛡️ PvP Nonaktif` (green) in safe/normal zones; switches automatically to `⚔️ PvP Aktif` (crimson glow) when stepping inside the Northeast Arena (`45, 11`).
  - **Live WIB Clock (`#wibClockPill`)**: Real-time `Asia/Jakarta` (`UTC+7`) clock (`🕒 HH:MM:SS WIB`) synchronized with the 12:00 WIB daily 3% Bank interest reset.

---

## 4. Right Dock, Hasil AFK Vault & World Info / News / Creator Modal

1. **Right Dock (`.right-dock`)**:
   - **Compact Citizen KTP Card**: Unclipped Chibi avatar, residency & citizen number (`WARGA • #00001`), live status badge (`Aktif` / `AFK` / `Pemulihan` / `Menunggu Bangkit`), character name, and vitals (`HP`, `Stm`, `🪙 Coin`, `🏦 Bank`, `🪱 Umpan`).
   - **Quick Tools Row**: `🎒 Tas [E]`, `🎁 Hasil AFK` (highlights in amber when AFK rewards are ready to claim), and `🌐 Wilayah & Berita`.
2. **Info Wilayah, Berita Kota & Kreator Modal (`openWorldInfoModal`)**:
   - **Wilayah 1**: Shows capacity (`25 pemain`), registered citizens (`18`), online count, regional AFK population (`18 / 25`), honest visual AFK note (`Visual AFK aktif: 5 dari 18 penduduk terdaftar`), and the 3-minute AFK cycle breakdown.
   - **Berita Kota**: Dated (`03 November 2026`) bilingual announcements categorized under `AFK`, `Ekonomi`, `Dungeon`, `Gameplay`, and `UI`.
   - **Info Kreator**: Official links opening in a new tab (`Website Kreator`, `TikTok Kreator`, `Dukung Kreator` via Saweria) with a clear voluntary support disclaimer.
