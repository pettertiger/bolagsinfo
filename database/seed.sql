INSERT INTO app_user (email, role)
VALUES
    ('petter.tiger@lantero.se', 'viewer'),
    ('karl.randerz@lantero.se', 'viewer'),
    ('andreas.wahlstrom@lantero.se', 'viewer'),
    ('andrew.sumba@lantero.se', 'viewer')
ON CONFLICT (email) DO NOTHING;

UPDATE app_user
SET role = 'admin'
WHERE email = 'petter.tiger@lantero.se';

WITH seed(company_name, due_date, note) AS (
    VALUES
        ('Österåkers kommun', '2030-01-31', NULL),
        ('Södertälje kommun (inkl Telge AB)', '2028-10-31', NULL),
        ('Nybro kommun', '2026-12-31', NULL),
        ('Stockholm Vatten (& Avfall)', '2023-12-31', NULL),
        ('Trafikverket', '2027-02-22', NULL),
        ('EKN', '2027-02-28', NULL),
        ('Uddevalla kommun', '2028-02-20', NULL),
        ('Atea/Finansinspektionen', '2029-02-28', NULL),
        ('Luleå kommun', '2031-03-31', NULL),
        ('Järfälla kommun', '2026-03-31', NULL),
        ('LUMIRE Luleå Miljöresurs', '2031-03-31', NULL),
        ('Tyresö kommun', '2027-04-02', NULL),
        ('Lulebo', '2031-03-31', NULL),
        ('Region Norrbotten', '2030-04-30', NULL),
        ('Arvidsjaur kommun', '2026-11-30', NULL),
        ('Enköpings kommun', '2035-04-30', NULL),
        ('Gällivare kommun', '2027-03-07', NULL),
        ('Gävle Energi', '2029-08-31', NULL),
        ('Gavlegårdarna', '2025-08-31', NULL),
        ('Ludvika kommun', '2026-03-28', NULL),
        ('Räddningstjänsten Skåne Nordväst', '2029-11-30', NULL),
        ('Pajala kommun', '2029-11-30', NULL),
        ('Kävlinge kommun', '2031-05-31', NULL),
        ('SigtunaHem', '2026-06-30', NULL),
        ('Arvika kommun', '2033-01-01', NULL),
        ('Atea/Kalmar kommun', '2029-05-31', NULL),
        ('Botkyrka kommun', '2033-01-11', NULL),
        ('Falkenbergs kommun', '2027-05-02', NULL),
        ('Gästrike återvinnare', '2028-06-03', NULL),
        ('Håbo kommun', '2035-04-30', NULL),
        ('Knivsta kommun', '2035-04-30', NULL),
        ('Luleå Lokaltrafik', '2031-03-31', NULL),
        ('Mörbylånga kommun', '2030-06-30', NULL),
        ('Region Jämtland Härjedalen', '2029-04-20', NULL),
        ('SFAB Södertörns fjärrvärme', '2027-06-30', NULL),
        ('Sunne kommun', '2026-12-31', NULL),
        ('Tierps kommun', '2035-04-30', NULL),
        ('Älvkarleby kommun', '2035-04-30', NULL),
        ('Östhammars kommun', '2035-04-30', NULL),
        ('Tomelilla kommun', '2032-05-31', NULL),
        ('Norberg (Redact)', '2030-05-21', NULL),
        ('Sigtuna kommun', '2026-06-30', NULL),
        ('Luleå hamn', '2031-03-31', NULL),
        ('Atea/Huddinge kommun', '2027-06-30', NULL),
        ('Atea/Pireva', '2032-06-30', NULL),
        ('Atea/Piteå kommun', '2027-06-01', NULL),
        ('Borgholms kommun', '2026-12-31', NULL),
        ('Eda kommun', '2033-01-01', NULL),
        ('Forshaga kommun', '2026-12-31', NULL),
        ('Grums kommun', '2026-12-31', NULL),
        ('Hagfors kommun', '2030-12-31', NULL),
        ('Hammarö kommun', '2030-06-30', NULL),
        ('Heby kommun', '2035-04-30', NULL),
        ('Hedemora kommun (inkl Hedemora Energi och Hedemora Kommunfastigheter/AB Hedemorabostäder)', '2030-06-30', NULL),
        ('Göliska IT', '2026-06-30', NULL),
        ('Göliska IT/Götene kommun', '2026-06-30', NULL),
        ('Göliska IT/Lidköpings Energi', '2026-06-30', NULL),
        ('Göliska IT/Lidköpings kommun', '2026-06-30', NULL),
        ('Göliska IT/Skara kommun', '2026-06-30', NULL),
        ('Göliska IT/Lidköping miljö och teknik', '2026-06-30', NULL),
        ('Kalix kommun', '2029-11-30', NULL),
        ('Kils kommun', '2026-12-31', 'Ny upphandling på gång'),
        ('Kristinehamns kommun', '2026-12-31', NULL),
        ('Redpill/BRÅ Brottsförebyggande rådet', '2030-05-31', NULL),
        ('Stenungsunds kommun', '2028-07-01', NULL),
        ('Säffle kommun', '2027-12-31', NULL),
        ('Torsby kommun', '2026-12-31', NULL),
        ('Årjängs kommun', '2026-12-31', NULL),
        ('Överkalix kommun', '2025-11-30', NULL),
        ('Atea/Högsby kommun', '2027-06-30', NULL),
        ('Köpings kommun', '2029-07-31', NULL),
        ('Atea/Täby kommun', '2028-07-31', NULL),
        ('Avesta kommun', '2030-06-30', NULL),
        ('Falu kommun', '2030-06-30', NULL),
        ('Luleå Energi', '2031-03-31', NULL),
        ('Tranemo kommun', '2023-08-31', NULL),
        ('Gavlefastigheter', '2029-08-31', NULL),
        ('Luleå Kommunföretag', '2031-03-31', NULL),
        ('Stockholms stad', '2029-09-30', NULL),
        ('Lunds kommun', '2031-09-30', NULL),
        ('Luleå Science Park', '2031-03-31', NULL),
        ('Adda', '2024-11-30', NULL),
        ('Atea/Oskarshamns kommun', '2026-12-09', NULL)
)
INSERT INTO contract (company_name, due_date, note)
SELECT seed.company_name, seed.due_date, seed.note
FROM seed
WHERE NOT EXISTS (
    SELECT 1
    FROM contract existing
    WHERE existing.company_name = seed.company_name
      AND existing.due_date = seed.due_date
    AND existing.note IS seed.note
);