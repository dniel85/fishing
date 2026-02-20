const { google } = require("googleapis");

async function main() {
  try {
    console.log("Starting Google Calendar push...");

    const calendarId = process.env.GCAL_CALENDAR_ID;
    const serviceAccount = JSON.parse(process.env.GCAL_SA_KEY_JSON);

    // Fix newline formatting in private key
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

    if (!calendarId) throw new Error("Missing GCAL_CALENDAR_ID");
    if (!serviceAccount) throw new Error("Missing GCAL_SA_KEY_JSON");

    const auth = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ["https://www.googleapis.com/auth/calendar"]
    );

    await auth.authorize();
    console.log("Authenticated as:", serviceAccount.client_email);

    const calendar = google.calendar({ version: "v3", auth });

    // Read forecast output
    const fs = require("fs");
    const forecastText = fs.readFileSync("forecast.txt", "utf8");

    // Use today's date for event title
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];

    const start = new Date();
    start.setHours(7, 0, 0, 0); // 7 AM local

    const end = new Date(start);
    end.setMinutes(start.getMinutes() + 15);

    // Delete existing events with same summary (prevents duplicates)
    const existing = await calendar.events.list({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      q: "Navarre AM Surf/Fishing/Kayak",
      singleEvents: true,
    });

    for (const event of existing.data.items) {
      await calendar.events.delete({
        calendarId,
        eventId: event.id,
      });
      console.log("Deleted old event:", event.id);
    }

    // Insert new event
    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `Navarre AM Surf/Fishing/Kayak (${dateStr})`,
        description: forecastText,
        start: {
          dateTime: start.toISOString(),
        },
        end: {
          dateTime: end.toISOString(),
        },
      },
    });

    console.log("Event created:", response.data.id);
    console.log("Done.");
  } catch (err) {
    console.error("Calendar push failed:");
    console.error(err.response?.data || err.message || err);
    process.exit(1);
  }
}

main();
