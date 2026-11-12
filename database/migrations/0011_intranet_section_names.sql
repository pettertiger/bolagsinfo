UPDATE intranet_section
SET name = 'Anställd på Lantero',
    description = 'Information för anställda: rutiner, frånvaro, helgdagar etc.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'anstalld';

UPDATE intranet_section
SET name = 'Kunder & bolagsbevakning',
    description = 'Avtalsöversikt, kundkarta och bolagsbevakning.',
    is_active = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'kunder';
