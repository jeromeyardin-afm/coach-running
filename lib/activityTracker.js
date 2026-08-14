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

module.exports = { isConfigured, wasAlreadySent, markAsSent };
