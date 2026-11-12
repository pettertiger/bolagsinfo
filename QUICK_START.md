# Snabb-referens: Nya sektioner

## Steg för steg - Så skapar du en ny intranät-sektion

### 1. Skapa HTML-filen
```
cp public/anstalld.html public/ny-sektion.html
```

Redigera:
- `<title>` - Ändra titel
- `.product-name` - Uppdatera sektionsnamn
- `.breadcrumbs` - Uppdatera brödsmulor
- `.page-head` - Ändra rubrik & beskrivning
- Lägg till ditt innehål

### 2. Verifiera att sektion är i databasen
Se `database/migrations/0010_intranet_sections.sql` för att sektion är listad.

Manuell SQL om behövs:
```sql
INSERT INTO intranet_section (id, name, description, is_active, sort_order)
VALUES ('ny-sektion', 'Ny Sektion', 'Beskrivning här', 0, 6);
```

### 3. Testa lokalt
```bash
wrangler dev
# Gå till http://localhost:8787/ny-sektion.html
```

### 4. Aktivera i admin-panel
```
https://intra.lantero.online/admin.html
→ Hitta "Ny Sektion"
→ Klicka toggle för att aktivera
```

### 5. Verifiera på startsidan
```
https://intra.lantero.online/
→ Sektion ska nu visas som ett kort
```

---

## Sektioner som är klara för att byggas

### Prioritet 1: Kunder & Kontrakt (`/kunder.html`)
**Status:** Data finns redan (från gamla Bolagsbevakning)
**Innehål:**
- Kundöversikt (lista över alla kunder)
- Gruppering per region
- Avtalsöversikt med förfallodatum
- Dashboard med avtals-status

**Migrera från:** `public/index.html.backup`
**Tidsestimering:** 2-3 timmar

### Prioritet 2: Om Lantero (`/om-lantero.html`)
**Status:** Behöver text & struktur
**Innehål:**
- Om företaget (historia, mission, vision)
- Värderingar
- Organisationsstruktur
- Ledningsgrupp
- Kontaktinformation

**Tidsestimering:** 1-2 timmar

### Prioritet 3: Media & Digitalt (`/media.html`)
**Status:** Behöver dashboard-integration
**Innehål:**
- Mediaöversikt (artiklar/omnämnanden)
- Webbtrafik-statistik
- Sökmotorsranking
- Social media-prestation
- Publicerings-kalender

**Behöver:** Data-integration (kanske API)
**Tidsestimering:** 2-4 timmar

### Prioritet 4: Resurser & Utveckling (`/resurser.html`)
**Status:** Behöver resurser att samla
**Innehål:**
- SCB-data & tools
- Sellfinity-integration
- Kartverktyg
- Dokumentation & guider
- Roadmap/backlog
- Feedback-kanal

**Tidsestimering:** 1-2 timmar

---

## Template - Kopiera denna för nya sektioner

```html
<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#ffffff">
  <title>Sektionsnamn | Lantero</title>
  <!-- Kopiera CSS från anstalld.html eller admin.html -->
  <style>
    /* Se befintliga sidor för styling */
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="topbar-inner">
        <a href="/" class="brand">
          <!-- Logga & branding -->
        </a>
      </div>
    </header>

    <main>
      <div class="breadcrumbs" aria-label="Brödsmulor">
        <a href="/">Lantero</a>
        <span aria-hidden="true">/</span>
        <span>Sektionsnamn</span>
      </div>
      
      <div class="page-head">
        <p class="eyebrow">Kategori</p>
        <h1>Sektionsnamn</h1>
        <p class="page-subtitle">Kort beskrivning av sektion</p>
      </div>

      <!-- Ditt innehål här -->

    </main>

    <footer class="footer">
      <span>Lantero · Sektionsnamn</span>
    </footer>
  </div>
</body>
</html>
```

---

## Git-workflow

```bash
# 1. Skapa branch
git checkout -b feature/ny-sektion

# 2. Skapa och redigera filer
# - public/ny-sektion.html
# - Eventuell JS-fil (public/ny-sektion.js)
# - Uppdatera docs

# 3. Commita
git add .
git commit -m "Lägg till ny sektion: Sektionsnamn

- Skapa /ny-sektion.html
- Innehål: [beskrivning]
- Kräver: admin-aktivering för att visas"

# 4. Push
git push origin feature/ny-sektion

# 5. Merga till main
git checkout main
git pull
git merge feature/ny-sektion

# 6. Deploy
wrangler deploy
wrangler d1 migrations apply intra --remote  # Om DB-ändringar
```

---

## Checkpoints vid varje sektion

- [ ] HTML skapad & testad lokalt
- [ ] Responsiv på mobil (testa med DevTools)
- [ ] Styling konsistent med andra sektioner
- [ ] Länkade resurser funkar (externa länkar, bilder, osv)
- [ ] Åtkomst-kontroll OK (kräver inloggning)
- [ ] Dokumentation uppdaterad
- [ ] Commitat till Git
- [ ] Aktiverad i admin-panel
- [ ] Synlig på startsidan
- [ ] QA-testning av medarbetare (eller admin)

---

## Vanliga CSS-klasser

```css
.eyebrow       /* Liten text ovan rubrik */
.page-head     /* Rubriken + beskrivning */
.tabs          /* Navigation mellan sub-sektioner */
.content-block /* Innehålls-box */
.button-primary /* Grön knapp */
.button-secondary /* Vit knapp */
.empty-state   /* Tom/ingen data-display */
```

---

## Tips

- Åtkomst-kontroll: Se `anstalld.html` för hur man skyddar sidor
- Använd `public/lantero-logo.png` för branding
- Använd befintliga färg-variabler: `--forest`, `--leaf`, `--muted`
- Testa alltid inloggning innan deploy
- Mobile-first design - börja med mobil sedan desktop

---

Se `docs/INTRANET_STRUCTURE.md` för mer information om varje sektion.
