import { MUNICIPALITIES } from "./municipalities.js";
import { MUNICIPALITY_ORGANISATIONS } from "./municipality-organisations.js";

const CONTACTS_URL = "https://www.sellfinity.com/api/external/contacts.json";
const PAGE_SIZE = 100;
const KNOWN_RELATIONSHIPS = new Set(["none", "contacted", "in_progress", "customer", "ex_customer"]);

function organisationNumber(value) {
  if (typeof value !== "string") return null;
  const normalised = value.replace(/[\s-]/g, "");
  return /^\d{10}$/.test(normalised) ? normalised : null;
}

function mappedMunicipalities() {
  const byName = new Map(MUNICIPALITIES.map(municipality => [municipality.name, municipality.code]));
  const mappings = Object.entries(MUNICIPALITY_ORGANISATIONS).map(([name, number]) => ({
    code: byName.get(name),
    number: organisationNumber(number)
  }));
  if (mappings.some(mapping => !mapping.code || !mapping.number) ||
      new Set(mappings.map(mapping => mapping.number)).size !== mappings.length) {
    throw new Error("Kommunernas organisationsnummer är felaktigt konfigurerade.");
  }
  return mappings;
}

async function fetchContacts(token) {
  const contacts = [];
  const seenIds = new Set();
  for (let offset = 0; ; ) {
    const url = new URL(CONTACTS_URL);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Sellfinity svarade med HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page?.contacts)) throw new Error("Sellfinitys kontaktsvar har oväntat format.");
    if (page.contacts.length === 0) break;
    for (const contact of page.contacts) {
      if (!Number.isInteger(contact?.id) || seenIds.has(contact.id)) {
        throw new Error("Sellfinitys kontaktlista innehåller saknade eller upprepade ID:n.");
      }
      seenIds.add(contact.id);
      contacts.push(contact);
    }
    offset += page.contacts.length;
  }
  return contacts;
}

function statusFor(contacts) {
  if (contacts.length === 0) return "unmatched";
  if (contacts.length !== 1) return "uncertain";
  const contact = contacts[0];
  if (contact.is_company !== true || contact.removed !== false || !Array.isArray(contact.fields)) return "uncertain";
  const fields = contact.fields.filter(field => field?.field_id === 301);
  if (fields.length !== 1 || !KNOWN_RELATIONSHIPS.has(fields[0].relationship)) return "uncertain";
  const relationship = fields[0].relationship;
  return relationship === "customer" || relationship === "ex_customer" ? relationship : "not_customer";
}

export async function syncSellfinity(env) {
  const attemptedAt = new Date().toISOString();
  try {
    if (typeof env.SELLFINITY_API_TOKEN !== "string" || !env.SELLFINITY_API_TOKEN.trim()) {
      throw new Error("Sellfinity-token är inte konfigurerad.");
    }
    const mappings = mappedMunicipalities();
    const contacts = await fetchContacts(env.SELLFINITY_API_TOKEN);
    const byNumber = new Map(mappings.map(mapping => [mapping.number, []]));
    for (const contact of contacts) {
      if (contact.removed === true || contact.is_company === false) continue;
      const number = organisationNumber(contact.orgnr);
      if (byNumber.has(number)) byNumber.get(number).push(contact);
    }
    const statements = [
      env.D8.prepare("DELETE FROM sellfinity_municipality_status").bind(),
      ...mappings.map(mapping => env.D8.prepare(`
        INSERT INTO sellfinity_municipality_status (municipality_code, status) VALUES (?, ?)
      `).bind(mapping.code, statusFor(byNumber.get(mapping.number)))),
      env.D8.prepare(`
        INSERT INTO sellfinity_sync (id, last_success_at, last_attempt_at, last_error)
        VALUES (1, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          last_success_at = excluded.last_success_at,
          last_attempt_at = excluded.last_attempt_at,
          last_error = NULL
      `).bind(attemptedAt, attemptedAt)
    ];
    await env.D8.batch(statements);
  } catch (error) {
    const message = error instanceof Error && (
      error.message.startsWith("Sellfinity") || error.message.startsWith("Kommunernas")
    ) ? error.message : "Synkroniseringen med Sellfinity misslyckades.";
    console.error(message);
    await env.D8.prepare(`
      INSERT INTO sellfinity_sync (id, last_attempt_at, last_error) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, last_error = excluded.last_error
    `).bind(attemptedAt, message).run();
    throw new Error(message);
  }
}
