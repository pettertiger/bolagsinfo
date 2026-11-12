# Intranätstruktur

## Överblick

Intranätet är strukturerat så att bara de sektioner som har innehål och är aktiverade visas för medarbetare. Nya sektioner kan läggas till successivt utan att förvirra användarna.

## Intranätsektioner

### 1. **Anställd** ✅ (Aktiverad)
- Information för alla anställda
- Rutiner för sjukfrånvaro och frånvaro
- Helgdagar och arbetsschema
- Villkor för anställning
- URL: `/anstalld.html`
- Status: **Fylld med innehål**

### 2. **Kunder & Kontrakt** (Kommande)
- Kundöversikt och filtreringsmöjligheter
- Avtalsöversikt med förfallodatum
- Information om nya affärer
- Säljstatus och pipeline
- URL: `/kunder.html`
- Status: **Inte startad**

### 3. **Media & Digitalt** (Kommande)
- Mediaöversikt och publiceringsschema
- Webbtrafik-dashboard
- Sökmotorsranking
- Social media-prestanda
- URL: `/media.html`
- Status: **Inte startad**

### 4. **Resurser & Utveckling** (Kommande)
- Verktyg och tjänster (SCB-data, Sellfinity, kartor)
- Dokumentation och guider
- Kunskapsbank
- Roadmap för utveckling
- URL: `/resurser.html`
- Status: **Inte startad**

### 5. **Om Lantero** (Kommande)
- Om företaget
- Värderingar och kultur
- Organisations- och ledningsstruktur
- Kontaktinformation
- URL: `/om-lantero.html`
- Status: **Inte startad**

## Admin-panel

### Tillgång
- URL: `/admin.html`
- Kräver admin-behörigheter
- Endast för administratörer

### Funktioner
Admin kan:
1. Se alla intranätsektioner
2. Aktivera/deaktivera sektioner med enkla toggleknappar
3. Se status på varje sektion
4. Se vilken URL varje sektion har

### Användning
1. Gå till `/admin.html`
2. För varje sektion som är klar: Klicka på toggle-knappen för att aktivera
3. Sektionen visas direkt på startsidan för medarbetare

## Startsida (`/index.html`)

### Innehål
- Visar endast **aktiva** sektioner
- Visar som kort med ikon, namn och beskrivning
- Klick på kort tar direkt till sektionen
- Länk till admin-panel (för administratörer)

### Dynamisk rendering
Startsidan hämtar automatiskt listan över aktiva sektioner från API:n:
- `GET /api/sections` - Hämtar alla sektioner och deras status
- Data cachas inte, så ändringar från admin visas direkt

## API-endpoints

### `GET /api/sections`
Hämtar status på alla sektioner.
- Kräver: Inloggning
- Returnerar: Objekt med `{ sectionId: boolean, ... }`

```json
{
  "anstalld": true,
  "kunder": false,
  "media": false,
  "resurser": false,
  "om-lantero": false
}
```

### `POST /api/sections`
Uppdaterar status på en sektion.
- Kräver: Admin-behörigheter
- Body: `{ sectionId: "string", active: boolean }`
- Returnerar: `{ ok: true }` eller felmeddelande

## Databas

### Tabell: `intranet_section`
Lagrar konfiguration för intranätsektioner.

Kolumner:
- `id` (TEXT): Unikt ID för sektionen (t.ex., "anstalld")
- `name` (TEXT): Visningsnamn
- `description` (TEXT): Kort beskrivning
- `is_active` (INTEGER): 0 = inaktiv, 1 = aktiv
- `sort_order` (INTEGER): Sorteringsordning på startsidan
- `created_at` (TEXT): Skapad tid
- `updated_at` (TEXT): Senast uppdaterad
- `updated_by` (INTEGER): Admin-användar-ID som gjorde sista ändringar

### Migration
Fil: `database/migrations/0010_intranet_sections.sql`
- Skapar tabellen och seedar default-sektioner
- "Anställd" är aktiverad som standard

## Workflow för att lägga till nytt innehål

1. **Skapa sektionssida** (t.ex., `/public/kunder.html`)
   - Använd befintlig mall (t.ex., från `anstalld.html`)
   - Bygg innehålet
   - Testa startsidan visar den inte (den är inte aktiverad ännu)

2. **Aktivera i admin**
   - Gå till `/admin.html`
   - Klicka toggle för sektionen
   - Sektion visas nu på startsidan

3. **Öppna för medarbetare**
   - Sektionen är nu synlig för alla inloggade
   - Kan deaktiveras senare om behövs

## Framtida utökning

- **Användarbehörigheter**: Vissa sektioner kunde begränsas till specifika roller
- **Sektionsinnehål-hantering**: Admin-gränssnitt för att redigera sektionsinnehål
- **Medarbetare-preferenser**: Användare kunde välja vilka sektioner de vill se
- **Notifikationer**: Varningar när avtalsförfallodatum närmar sig
