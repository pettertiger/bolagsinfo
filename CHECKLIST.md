# Intranät - Implementation Checklista

## ✅ Slutfört
- [x] Ny intranätstruktur designad
- [x] Databastabel för sektioner skapad (`intranet_section`)
- [x] Migration för sektioner (`0010_intranet_sections.sql`)
- [x] API-endpoints skapade (`GET` och `POST /api/sections`)
- [x] Ny dynamisk startsida skapad (`public/index.html`)
- [x] Admin-panel skapad (`public/admin.html`)
- [x] Dokumentation skrivna

## 🔄 Nästa steg

### 1. Verifiera Installation
- [ ] Kör databas-migration: `wrangler d1 migrations apply intra --remote`
- [ ] Verifiera att `intranet_section` tabellen finns i databasen
- [ ] Kontrollera att "Anställd" är aktiverad i tabellen

### 2. Testa Startsida
- [ ] Gå till `https://intra.lantero.online/`
- [ ] Verifiera att startsidan laddar
- [ ] Verifiera att endast "Anställd"-kortet visas
- [ ] Verifiera att det finns en Admin-länk i topbar

### 3. Testa Admin-Panel
- [ ] Gå till `https://intra.lantero.online/admin.html`
- [ ] Verifiera inloggning (kräver admin-rol)
- [ ] Verifiera att alla 5 sektioner visas
- [ ] Verifiera att "Anställd" har grön status
- [ ] Verifiera att andra sektioner har grå status

### 4. Testa Toggle-funktionalitet
- [ ] Klicka toggle för "Kunder & Kontrakt"
- [ ] Verifiera att den blir grön/aktiv
- [ ] Gå till startsidan
- [ ] Verifiera att "Kunder & Kontrakt"-kortet nu visas
- [ ] Återgå till admin och slå av den igen

### 5. Säkerhet
- [ ] Verifiera att `/admin.html` kräver inloggning
- [ ] Verifiera att `/admin.html` kräver admin-roll (testa med viewer-konto)
- [ ] Verifiera att POST `/api/sections` kräver admin-roll

## 📝 Nästa innehåll att skapa

### Kort sikt (denna vecka/nästa vecka)
1. [ ] **Kunder & Kontrakt** (`/kunder.html`)
   - Migrera befintlig "Bolagsbevakning" innehål
   - Lägg till kundöversikt per region
   - Lägg till avtalsöversikt med dashboard

2. [ ] Uppdatera länk från gamla "Bolagsbevakning" till ny struktur

### Medellång sikt (kommande månader)
3. [ ] **Media & Digitalt** (`/media.html`)
   - Webbtrafik dashboard
   - Media-omtal tracker
   - Publikations-arkiv

4. [ ] **Om Lantero** (`/om-lantero.html`)
   - Företagsinformation
   - Organisationsstruktur
   - Kontaktinformation

### Långsikt
5. [ ] **Resurser & Utveckling** (`/resurser.html`)
   - SCB-data och tools
   - Dokumentation
   - Roadmap

## 💾 Filer att commita

```bash
# Nya filer
public/admin.html
public/index.html (ersätter gamla)
docs/INTRANET_STRUCTURE.md

# Uppdaterade filer
index.js (API endpoints tillagda)

# Database
database/migrations/0010_intranet_sections.sql
```

## 🚀 Deploy

1. Commita alla ändringar
2. Pusha till main
3. Deploy med: `wrangler deploy`
4. Kör migration på produktion
5. Testa alla endpoints

## 🎨 Design-noteringar

- Startsida använder kort-layout med ikoner
- Admin-panel använder toggle-switches för enkelt UI
- Färgschema: Grönt (#17483d) för aktiva, grått för inaktiva
- Mobil-responsiv design (funkar på alla storlekar)
