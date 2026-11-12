# Lantero Intranät - Arkitektur & Navigation

## Användarflöde

```
┌─────────────────────────────────────────────────────────┐
│                   STARTSIDA (/)                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Lantero | INTRANÄT              ⚙️ Admin          │ │
│  ├────────────────────────────────────────────────────┤ │
│  │                                                    │ │
│  │  Välkommen till Lanteros intranät                 │ │
│  │                                                    │ │
│  │ ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │ │
│  │ │ 👤 Anställd  │  │ 🏢 Kunder &  │  │ 📊 Media │ │ │
│  │ │ på Lantero   │  │ bolagsbevakn.│  │          │ │ │
│  │ │              │  │              │  │          │ │ │
│  │ │ Info för     │  │ Avtal, karta │  │ Webbtraf │ │ │
│  │ │ anställda    │  │ och bolag    │  │ik-dash   │ │ │
│  │ └──────────────┘  └──────────────┘  └──────────┘ │ │
│  │                                                    │ │
│  │         Endast AKTIVA sektioner visas             │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            ↓
            ┌──────────────────────────────┐
            │   Klick på sektion-kort       │
            └──────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────┐
        │  /anstalld.html, /kunder.html, etc  │
        │  Sektion-sidan med fullt innehål    │
        └──────────────────────────────────────┘
```

## Admin-flöde

```
┌─────────────────────────────────────────────────────────┐
│                 ADMIN-PANEL (/admin.html)               │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Lantero | Intranät Admin        Kräver admin-roll │ │
│  ├────────────────────────────────────────────────────┤ │
│  │                                                    │ │
│  │  Hantera intranätavsnitt                          │ │
│  │                                                    │ │
│  │ ┌────────────────────────────────────────────┐   │ │
│  │ │ 👤 Anställd          [████████] ON       │   │ │
│  │ │ Info för anställda   Status: Aktiverad   │   │ │
│  │ └────────────────────────────────────────────┘   │ │
│  │                                                    │ │
│  │ ┌────────────────────────────────────────────┐   │ │
│  │ │ 🏢 Kunder & Kontrakt [________] OFF       │   │ │
│  │ │ Kundöversikt         Status: Inaktiv      │   │ │
│  │ └────────────────────────────────────────────┘   │ │
│  │                                                    │ │
│  │ ┌────────────────────────────────────────────┐   │ │
│  │ │ 📊 Media & Digitalt  [████████] ON       │   │ │
│  │ │ Media-dashboard      Status: Aktiverad   │   │ │
│  │ └────────────────────────────────────────────┘   │ │
│  │                                                    │ │
│  │  (Fler sektioner...)                              │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            ↓
            ┌──────────────────────────────┐
            │   Klick på toggle-knapp      │
            │   Spara ändringar till DB    │
            └──────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────┐
        │   Startsida uppdateras automatiskt   │
        │   Visar bara aktiverade sektioner    │
        └──────────────────────────────────────┘
```

## Databas-schema

```
┌────────────────────────────┐
│   intranet_section         │
├────────────────────────────┤
│ id (TEXT) PRIMARY KEY      │  ← "anstalld", "kunder", etc
│ name (TEXT)                │  ← "Anställd", "Kunder & Kontrakt"
│ description (TEXT)         │  ← Kort beskrivning
│ is_active (INTEGER 0/1)    │  ← 0 = dold, 1 = synlig
│ sort_order (INTEGER)       │  ← 1, 2, 3, ... (sortering)
│ created_at (TEXT ISO)      │
│ updated_at (TEXT ISO)      │
│ updated_by (INTEGER FK)    │  ← Referens till app_user
└────────────────────────────┘
```

## API-endpoints

```
┌─────────────────────────────────────────────────────────┐
│                    REST API                             │
├──────────────────────┬─────────────────────────────────┤
│ GET /api/sections    │ Hämta status på alla sektioner  │
│                      │ Kräver: Inloggning              │
│ Returnerar:          │                                 │
│ {                    │                                 │
│   "anstalld": true,  │                                 │
│   "kunder": false    │                                 │
│ }                    │                                 │
├──────────────────────┼─────────────────────────────────┤
│ POST /api/sections   │ Uppdatera sektion-status        │
│                      │ Kräver: Admin-roll              │
│ Body:                │                                 │
│ {                    │                                 │
│   "sectionId": "...", │                                │
│   "active": boolean  │                                 │
│ }                    │                                 │
│ Returnerar: { ok: true } eller error                   │
└──────────────────────┴─────────────────────────────────┘
```

## Filstruktur

```
intra/
├── public/
│   ├── index.html          ← Startsida (dynamisk)
│   ├── admin.html          ← Admin-panel
│   ├── anstalld.html       ← Anställd på Lantero ✅
│   ├── kunder.html         ← Nav till avtal, karta och bolagsbevakning ✅
│   ├── bolagsbevakning.html← Bolagsbevakning och avtalsöversikt ✅
│   ├── anstalld.js
│   ├── helgdagar.mjs
│   ├── karta.html          ← Kommer: Kunder-sektion
│   ├── karta.js
│   └── lantero-logo.png
│
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   └── migrations/
│       ├── 0001_...
│       ├── ...
│       └── 0010_intranet_sections.sql  ← NEU
│
├── docs/
│   ├── functionality.md
│   └── INTRANET_STRUCTURE.md  ← NEU
│
├── index.js                 ← API-endpoints tillagda
├── index.html              ← Root (backend-route)
├── CHECKLIST.md            ← NEU
├── wrangler.jsonc
└── package.json
```

## Implementation-status

```
STARTSIDA
├── ✅ HTML-struktur
├── ✅ CSS-styling
├── ✅ Dynamisk sektion-rendering
├── ✅ API-integrering
└── ✅ Mobil-responsiv

ADMIN-PANEL
├── ✅ HTML-struktur
├── ✅ CSS-styling
├── ✅ Toggle-funktionalitet
├── ✅ API-integrering
├── ✅ Permission-kontroll
└── ✅ Mobil-responsiv

API
├── ✅ GET /api/sections
├── ✅ POST /api/sections
└── ✅ Admin-authorization

DATABASE
├── ✅ Tabell-schema
├── ✅ Migration-fil
├── ✅ Default-data
└── ⏳ Kräver: wrangler d1 migrations apply

NÄSTA STEG
├── ⏳ Migration på produktion
├── ⏳ Testa alla endpoints
├── 🔜 Skapa /kunder.html
├── 🔜 Skapa /media.html
├── 🔜 Skapa /resurser.html
└── 🔜 Skapa /om-lantero.html
```

## Sektioner - Aktiverings-order

Rekommenderat aktiveringsordning baserat på beredskap:

```
VECKA 1 (DENNA VECKA)
└── 1. Anställd ✅
    └── Status: Redan aktiverad & fylld med innehål

VECKA 2-3
└── 2. Kunder & Kontrakt
    └── Status: Börja bygga sektion
    └── Prioritet: HÖG (redan data från Bolagsbevakning)

VECKA 4-5
└── 3. Om Lantero
    └── Status: Börja skriva innehål
    └── Prioritet: MEDIUM (enkelt innehål)

VECKA 6-8
├── 4. Media & Digitalt
│   └── Status: Integrera dashboards
│   └── Prioritet: MEDIUM (behöver data-integration)
│
└── 5. Resurser & Utveckling
    └── Status: Samla resurser
    └── Prioritet: LOW (support-innehål)
```
