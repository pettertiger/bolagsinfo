import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/generate-access-code.mjs user@example.com");
  process.exit(1);
}

const readline = createInterface({ input, output });
const code = await readline.question("Skriv åtkomstkoden (den visas inte i databasen): ");
readline.close();
if (!code || code.length < 10) {
  console.error("Koden måste vara minst 10 tecken.");
  process.exit(1);
}

const iterations = 100000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(code, salt, iterations, 32, "sha256");
const encode = value => value.toString("base64url");

console.log(`UPDATE app_user SET access_code_salt = '${encode(salt)}', access_code_hash = '${encode(hash)}', access_code_iterations = ${iterations} WHERE email = '${email.replaceAll("'", "''")}';`);
