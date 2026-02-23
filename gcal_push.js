const { google } = require("googleapis");
const fs = require("fs");

/* ============================
   Fish Emoji Scale
============================ */
function fishScale(rating) {
  switch (rating) {
    case "Excellent": return "🐟🐟🐟🐟🐟";
    case "Good": return "🐟🐟🐟🐟";
    case "Fair": return "🐟🐟🐟";
    case "Poor": return "🐟🐟";
    default: return "🚫";
  }
}

/* ============================
   Weekend Detection
============================ */
function isWeekend(date) {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

/* ============================
   Basic US Holiday List
============================ */
const usHolidays = ["01-01", "07-04", "11-11", "12-25"];

function isHoliday(date) {
  const mmdd = date.toISOString().slice(5, 10);
  return usHolidays.includes(mmdd);
}

/* ============================
   Add Days Helper
============================ */
function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ============================
   MAIN
============================ */
async function main() {
  try {
    console.log("Starting Google Calendar push...");

    const calendarId = process.env.GCAL_CALENDAR_ID;
    if (!calendarId) throw new Error("Missing GCAL_CALENDAR_ID");

    const serviceAccount = JSON.parse(process.env.GCAL_SA_KEY_JSON || "{}");
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("Missing/invalid GCAL_SA_KEY_JSON");
    }

    serviceAccount.private_key =
      serviceAccount.private_key.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ["https://www.googleapis.com/auth/calendar"]
    );

    await auth.authorize();
    console.log("Authenticated.");

    const calendar = google.calendar({ version: "v3", auth });

    const lines = fs
      .readFileSync("forecast.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    const todayISO = new Date().toISOString().slice(0, 10);
    const maxISO = addDaysISO(todayISO, 7);

    for (const line of lines) {

      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1];
      if (dateStr < todayISO || dateStr > maxISO) continue;

      const fishingMatch = line.match(/Fishing:\s*([A-Za-z']+)/);
      const fishing = fishingMatch ? fishingMatch[1] : "Fair";

      const kayakMatch = line.match(/Kayak:\s*(.+)$/);
      const kayak = kayakMatch ? kayakMatch[1].trim() : "";

      const fishDisplay = fishScale(fishing);

      /* ============================
         Color Coding
      ============================ */
      let colorId = "5";
      if (fishing === "Excellent") colorId = "2";
      else if (fishing === "Good") colorId = "9";
      else if (fishing === "Poor") colorId = "11";

      /* ============================
         Push Notification Logic
      ============================ */
      const dateObj = new Date(dateStr + "T00:00:00Z");

      let reminders = { useDefault: false };

      if (kayak === "Perfect" &&
          (isWeekend(dateObj) || isHoliday(dateObj))) {

        reminders = {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 180 },
            { method: "popup", minutes: 60 }
          ]
        };
      }

      const summary =
        `${fishDisplay}${kayak === "Perfect" ? " 🔥" : ""} Navarre`;

      const description =
        line.replace(/Fishing:\s*[^|]+(\|)?\s*/i, "").trim();

      /* ============================
         Stable Safe Event ID
         (no hyphens)
      ============================ */
      const eventId =
        `navarre${dateStr.replace(/-/g, "")}`;

      const requestBody = {
        summary,
        description,
        colorId,
        start: { date: dateStr },
        end: { date: addDaysISO(dateStr, 1) },
        reminders,
        extendedProperties: {
          private: { source: "navarre-bot" }
        }
      };

      /* ============================
         UPDATE FIRST
         INSERT ONLY IF 404
      ============================ */
      try {
        await calendar.events.update({
          calendarId,
          eventId,
          requestBody,
        });
        console.log("Updated:", dateStr);
      }
      catch (e) {
        const code = e?.code || e?.response?.status;

        if (code === 404) {
          await calendar.events.insert({
            calendarId,
            eventId,
            requestBody,
          });
          console.log("Created:", dateStr);
        }
        else {
          throw e;
        }
      }
    }

    console.log("Done.");
  }
  catch (err) {
    console.error("Calendar push failed:");
    console.error(err.response?.data || err.message || err);
    process.exit(1);
  }
}

main();
