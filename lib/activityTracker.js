const { Redis } = require('@upstash/redis');

// TTL généreux (60 jours) : très supérieur à ACTIVITY_LOOKBACK_HOURS, sert
// uniquement à ne pas laisser grossir le store indéfiniment — ce n'est pas
// lui qui définit la fenêtre de "nouveauté" d'une activité.
const SENT_TTL_SECONDS = 60 * 24 * 60 * 60;
const KEY_PREFIX = 'coach:sent-activity:';

let redis = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

function isConfigured() {
  return redis !== null;
}

// Sans store Redis connecté, on ne bloque jamais l'envoi (comportement
// actuel inchangé) — seule la protection anti-doublon est indisponible, ce
// qui est signalé une fois côté appelant plutôt que de faire planter le cron.
async function wasAlreadySent(activityId) {
  if (!redis) return false;
  try {
    return Boolean(await redis.get(`${KEY_PREFIX}${activityId}`));
  } catch (error) {
    console.log('Vérification anti-doublon indisponible (Redis) :', error.message);
    return false;
  }
}

async function markAsSent(activityId) {
  if (!redis) return;
  try {
    await redis.set(`${KEY_PREFIX}${activityId}`, 1, { ex: SENT_TTL_SECONDS });
  } catch (error) {
    console.log("Impossible d'enregistrer l'activité comme envoyée (Redis) :", error.message);
  }
}

// Contrairement à une activité (immuable, un identifiant Garmin unique), le
// bilan hebdo change de contenu tout au long de la semaine (nouvelles
// séances) — un blocage "déjà envoyé cette semaine" façon activité serait
// donc trop strict et empêcherait un bilan à jour plus tard dans la
// semaine. On se contente d'un anti-rebond court : bloquer les envois
// répétés du même bilan sur quelques heures (déclenchements manuels
// rapprochés, tests), sans empêcher un renvoi légitime le lendemain ou
// après une nouvelle séance.
const WEEKLY_REPORT_THROTTLE_SECONDS = 3 * 60 * 60;
const WEEKLY_REPORT_KEY_PREFIX = 'coach:sent-weekly-report:';

async function wasWeeklyReportSentRecently(week) {
  if (!redis) return false;
  try {
    return Boolean(await redis.get(`${WEEKLY_REPORT_KEY_PREFIX}${week}`));
  } catch (error) {
    console.log('Vérification anti-doublon indisponible (Redis) :', error.message);
    return false;
  }
}

async function markWeeklyReportSent(week) {
  if (!redis) return;
  try {
    await redis.set(`${WEEKLY_REPORT_KEY_PREFIX}${week}`, 1, { ex: WEEKLY_REPORT_THROTTLE_SECONDS });
  } catch (error) {
    console.log("Impossible d'enregistrer le bilan hebdo comme envoyé (Redis) :", error.message);
  }
}

module.exports = { isConfigured, wasAlreadySent, markAsSent, wasWeeklyReportSentRecently, markWeeklyReportSent };
