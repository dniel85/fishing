import fs from "fs";
import crypto from "crypto";
import { google } from "googleapis";

const CALENDAR_ID = process.env.GCAL_CALENDAR_ID; // e.g. "...@group.calendar.google.com"
const SA_JSON = JSON.parse(process.env.GCAL_SA_KEY_JSON); // JSON text in secret

function stableEventId(dateStr) {
  // Google eventId must be 5-1024 chars, letters/digits/_/-
  const hash = crypto.createHash("sha1").update(`navarre-${dateStr}`).digest("hex");
  return `navarre-${hash}`; // stable per day
}

async function main() {
  if (!CALENDAR_ID) throw new Error("Missing GCAL_CALENDAR_ID");
  if (!SA_JSON?.client_email || !SA_JSON?.private_key) throw new Error("Bad GCAL_SA_KEY_JSON");

  // Read your forecast output (we'll create it in the workflow)
  const text = fs.readFileSync("forecast.txt", "utf8").trim();
  if (!text) throw new Error("forecast.txt is empty");

  // Determine "today" from the first line date, fallback to local today
  // Expected line format: YYYY-MM-DD | ...
  const firstDate = (text.match(/^(\d{4}-\d{2}-\d{2})\s\|/m) || [])[1];
  const dateStr = firstDate || new Date().toISOString().slice(0, 10);

  const auth = new google.auth.JWT({
    email: SA_JSON.client_email,
    key: SA_JSON.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  const calendar = google.calendar({ version: "v3", auth });

  const eventId = stableEventId(dateStr);

  // Put event at a consistent time (local calendar timezone will render it)
  // This makes it easy to find; you can change it to all-day if you prefer.
  const start = new Date(`${dateStr}T06:00:00-06:00`).toISOString();
  const end = new Date(`${dateStr}T06:15:00-06:00`).toISOString();

  const event = {
    id: eventId,
    summary: `Navarre AM Surf/Fishing/Kayak (${dateStr})`,
    description: text,
    start: { dateTime: start },
    end: { dateTime: end },
  };

  // Upsert (create or update)
  try {
    await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
    await calendar.events.update({ calendarId: CALENDAR_ID, eventId, requestBody: event });
    console.log(`Updated event ${eventId}`);
  } catch (e) {
    // If not found, create
    await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: event });
    console.log(`Created event ${eventId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
