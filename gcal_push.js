const fs = require("fs");
const crypto = require("crypto");
const { google } = require("googleapis");

const CALENDAR_ID = process.env.GCAL_CALENDAR_ID;
const SA_JSON = JSON.parse(process.env.GCAL_SA_KEY_JSON);

function stableEventId(dateStr) {
  const hash = crypto.createHash("sha1")
    .update(`navarre-${dateStr}`)
    .digest("hex");
  return `navarre-${hash}`;
}

async function main() {

  if (!CALENDAR_ID) throw new Error("Missing GCAL_CALENDAR_ID");
  if (!SA_JSON.client_email) throw new Error("Bad GCAL_SA_KEY_JSON");

  const text = fs.readFileSync("forecast.txt", "utf8").trim();

  const firstDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/m);
  const dateStr = firstDateMatch ? firstDateMatch[1] : new Date().toISOString().slice(0, 10);

  const auth = new google.auth.JWT({
    email: SA_JSON.client_email,
    key: SA_JSON.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  const calendar = google.calendar({ version: "v3", auth });

  const eventId = stableEventId(dateStr);

  const start = new Date(`${dateStr}T06:00:00-06:00`).toISOString();
  const end = new Date(`${dateStr}T06:15:00-06:00`).toISOString();

  const event = {
    id: eventId,
    summary: `Navarre AM Surf/Fishing/Kayak (${dateStr})`,
    description: text,
    start: { dateTime: start },
    end: { dateTime: end },
  };

  try {
    await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
    await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: event,
    });
    console.log("Updated existing event");
  } catch {
    await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
    });
    console.log("Created new event");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
