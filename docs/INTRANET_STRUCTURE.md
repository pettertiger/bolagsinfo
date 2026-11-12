# Intranätstruktur

## Överblick

Intranätet är strukturerat så att bara de sektioner som har innehål och är aktiverade visas för medarbetare. Nya sektioner kan läggas till successivt utan att förvirra användarna.

## Intranätsektioner

### 1. **Anställd på Lantero** ✅ (Aktiverad)
- Information för alla anställda
- Rutiner för sjukfrånvaro och frånvaro
- Helgdagar och arbetsschema
- Villkor för anställning
- URL: `/anstalld.html`
- Status: **Fylld med innehål**

### 2. **Kunder & bolagsbevakning** ✅ (Aktiverad)
- Avtalsöversikt med förfallodatum
- Kundkarta med kommuner och regioner
- Bolagsbevakning, inklusive nya bolag i kategorin 50–99 anställda
- Sidan fungerar som nav till respektive verktyg
- URL: `/kunder.html`
- Avtalsöversikt och bolagsbevakning: `/bolagsbevakning.html`
- Kundkarta: `/karta.html`
- Status: **Fyllt med innehåll**

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
1. Skapa nya avsnitt och redigera namn och beskrivning
2. Aktivera/deaktivera avsnitt
3. Lägga till och redigera underrubriker och textblock
4. Ta bort textblock
5. Se att synligheten för närvarande gäller alla medarbetare

### Användning
1. Gå till `/admin.html`
2. Skapa avsnitt eller välj ett befintligt
3. Lägg till och spara textblock
4. Aktivera avsnittet när innehållet är redo
5. Avsnittet och dess text visas för alla inloggade medarbetare

## Startsida (`/index.html`)

### Innehål
- Visar endast **aktiva** sektioner
- Visar som kort med ikon, namn och beskrivning
- Klick på kort tar direkt till sektionen
- Länk till admin-panel (för administratörer)

### Dynamisk rendering
Startsidan hämtar aktiva avsnitt, namn och beskrivningar från `GET /api/sections`. Fördefinierade avsnitt länkar till sina befintliga sidor; nya avsnitt öppnas i den generiska innehållsvyn.

## Innehåll och synlighet

Admininnehåll sparas som ren text med valfri underrubrik. HTML-kod tolkas inte, vilket gör att text visas säkert som text. Sparat innehåll visas på respektive avsnittssida.

Synlighetsläget är tills vidare `all`: alla inloggade medarbetare ser aktiverade avsnitt. Individuell åtkomst väljs inte i admin ännu. Migration `0012_intranet_content_and_visibility.sql` förbereder ett läge för valda användare och en koppling till användarkonton; individuell synlighet ska aktiveras först när långsiktig SSO- och användarhantering finns på plats.

## API-endpoints

### `GET /api/sections`
Hämtar aktiverade avsnitt och deras publicerade textblock.
- Kräver: Inloggning
- Returnerar: `{ sections: [{ id, name, description, visibilityMode, content }] }`

### `GET /api/admin/sections`
Hämtar alla avsnitt, inklusive dolda, och deras textblock.
- Kräver: Admin-behörigheter

### `POST /api/admin/sections`
Skapar ett avsnitt. Nya avsnitt är dolda tills admin aktiverar dem.
- Kräver: Admin-behörigheter
- Body: `{ name, description, visibilityMode: "all" }`

### `PATCH /api/admin/sections/:id`
Uppdaterar namn, beskrivning och aktiveringsstatus.
- Kräver: Admin-behörigheter
- Body: `{ name, description, isActive, visibilityMode: "all" }`

### `/api/admin/sections/:id/content`
Adminskyddade `POST`, `PATCH` och `DELETE`-operationer för textblock. Textblock har valfri underrubrik och ren text.
- Kräver: Admin-behörigheter

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
- `visibility_mode` (TEXT): `all` nu; `selected` reserverat för framtida individuella målgrupper

### Innehållstabeller
- `intranet_content_block`: underrubrik, text, sorteringsordning och ändringsmetadata per avsnitt
- `intranet_section_user`: förberedd koppling mellan avsnitt och användarkonton för framtida selektiv åtkomst

### Migrationer
- `0010_intranet_sections.sql` skapar och fyller grundavsnitten
- `0011_intranet_section_names.sql` uppdaterar namn och aktiverar kundsektionen
- `0012_intranet_content_and_visibility.sql` skapar textblock och framtida synlighetsmodell

## Workflow för att lägga till nytt innehål

1. Skapa avsnitt i `/admin.html`
2. Lägg till underrubriker och textblock i admin
3. Förhandsgranska genom att öppna avsnittssidan medan det är aktiverat
4. Aktivera avsnittet när innehållet är redo

Individuella målgrupper är framtida arbete och ska inte aktiveras innan SSO-identiteterna är etablerade.
