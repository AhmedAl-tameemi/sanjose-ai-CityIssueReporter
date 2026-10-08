import app from "./app";
import { logger } from "./lib/logger";
import { ensureCityAccidentsSynced } from "./lib/cityAccidentStore";
import { ensureReportSummaries } from "./lib/reportSummaryBackfill";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  const refreshSummaries = () => {
    void ensureReportSummaries().catch(() => logger.warn("AI summary recovery failed; original reports were preserved"));
  };
  refreshSummaries();
  setInterval(refreshSummaries, 60_000).unref();
  const syncCityAccidents = () => {
    void ensureCityAccidentsSynced().catch(() => logger.warn("City accident import failed; existing stored records were preserved"));
  };
  syncCityAccidents();
  setInterval(syncCityAccidents, 60 * 60_000).unref();
});
