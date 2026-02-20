const { google } = require("googleapis");
const fs = require("fs");

async function main() {
  try {
    console.log("Starting Google Calendar push...");

    const calendarId = process.env.GCAL_CALENDAR_ID;
    const serviceAccount = JSON.parse(process.env.GCAL_SA_KEY_JSON);

    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ["https://www.googleapis.com/auth/calendar"]
    );

    await auth.authorize();
    console.log("Authenticated.");

    const calendar = google.calendar({ version: "v3", auth });

    const forecastLines = fs
      .readFileSync("forecast.txt", "utf8")
      .split("\n")
      .filter(line => line.trim().length > 0);

    for (const line of forecastLines) {
      // Extract date (YYYY-MM-DD at beginning of line)
      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1];
      const eventDate = new Date(dateStr + "T07:00:00");

      const endDate = new Date(eventDate);
      endDate.setMinutes(eventDate.getMinutes() + 15);

      const summary = `Navarre AM Forecast`;

      // Delete existing event for that day
      const existing = await calendar.events.list({
        calendarId,
        timeMin: new Date(dateStr + "T00:00:00Z").toISOString(),
        timeMax: new Date(dateStr + "T23:59:59Z").toISOString(),
        q: "Navarre AM Forecast",
        singleEvents: true,
      });

      for (const event of existing.data.items) {
        await calendar.events.delete({
          calendarId,
          eventId: event.id,
        });
      }

      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description: line,
          start: {
            dateTime: eventDate.toISOString(),
          },
          end: {
            dateTime: endDate.toISOString(),
          },
        },
      });

      console.log("Created event for:", dateStr);
    }

    console.log("All forecast events created.");
  } catch (err) {
    console.error("Calendar push failed:");
    console.error(err.response?.data || err.message || err);
    process.exit(1);
  }
}

main();
