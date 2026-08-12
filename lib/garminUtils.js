function formatPace(distanceMeters, durationSeconds) {
  const distanceKm = distanceMeters / 1000;
  const durationMinutes = durationSeconds / 60;
  const paceMinutes = Math.floor(durationMinutes / distanceKm);
  const paceSeconds = Math.round((durationMinutes / distanceKm - paceMinutes) * 60);
  return `${paceMinutes}:${String(paceSeconds).padStart(2, '0')}`;
}

// garmin-connect renvoie "YYYY-MM-DD HH:mm:ss" (GMT) pour startTimeGMT.
function parseGarminDate(startTimeGMT) {
  return new Date(`${startTimeGMT.replace(' ', 'T')}Z`);
}

// Même formatage que DateUtils.toDateString() en interne dans garmin-connect,
// pour rester cohérent avec la façon dont la lib calcule déjà "aujourd'hui"
// pour getSleepData/getDailyWeightData. Nécessaire ici car les endpoints
// training status/readiness/max metrics (non couverts par la lib) attendent
// la date directement dans l'URL plutôt qu'un objet Date.
function toGarminDateString(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
}

// Exclut la natation/vélo/autres du calcul de volume de course, qui doit
// rester comparable au volume prévu dans schedule.js (course uniquement).
function isRunningActivity(typeKey) {
  return typeof typeKey === 'string' && typeKey.toLowerCase().includes('running');
}

// L'API Garmin lève une erreur si aucune donnée de sommeil n'existe pour la
// date demandée (montre pas portée cette nuit-là, etc.) — normal, pas une
// vraie erreur. Renvoie null dans ce cas plutôt que de faire planter l'appelant.
function summarizeSleep(sleepData) {
  const dto = sleepData?.dailySleepDTO;
  if (!dto || !dto.sleepTimeSeconds) return null;

  const hours = Math.floor(dto.sleepTimeSeconds / 3600);
  const minutes = Math.round((dto.sleepTimeSeconds % 3600) / 60);

  return {
    duration: `${hours}h${String(minutes).padStart(2, '0')}`,
    score: dto.sleepScores?.overall?.value ?? null,
    scoreQualifier: dto.sleepScores?.overall?.qualifierKey ?? null,
    restingHeartRate: sleepData.restingHeartRate ?? null,
    avgOvernightHrv: sleepData.avgOvernightHrv ?? null,
    hrvStatus: sleepData.hrvStatus ?? null,
    bodyBatteryChange: sleepData.bodyBatteryChange ?? null,
  };
}

// Poids Garmin renvoyé en grammes.
function summarizeWeight(weightData) {
  const entries = weightData?.dateWeightList;
  if (!entries || entries.length === 0) return null;
  const latest = entries[entries.length - 1];
  if (latest.weight == null) return null;
  return {
    weightKg: Math.round(latest.weight / 10) / 100,
    bodyFatPercent: latest.bodyFat,
  };
}

// Endpoint non documenté (voir garmin.js) : la forme exacte peut varier.
// Défensif — si un tour n'a pas les champs attendus, il est ignoré plutôt
// que de faire planter tout le résumé ; si rien n'est exploitable, renvoie
// null et l'appelant retombe sur la moyenne de l'activité complète.
function summarizeSplits(splitsData) {
  const laps = splitsData?.lapDTOs;
  if (!Array.isArray(laps) || laps.length === 0) return null;

  const segments = laps
    .map((lap, i) => {
      if (!lap.distance || !lap.duration) return null;
      return {
        segment: i + 1,
        distanceKm: Math.round((lap.distance / 1000) * 100) / 100,
        pace: formatPace(lap.distance, lap.duration),
        avgHR: lap.averageHR || null,
      };
    })
    .filter(Boolean);

  return segments.length > 0 ? segments : null;
}

// Terminologie stable de l'app Garmin Connect (Statut d'entraînement).
const TRAINING_STATUS_LABELS = {
  NO_STATUS: 'Pas assez de données',
  DETRAINING: 'Désentraînement',
  RECOVERY: 'Récupération',
  MAINTAINING: 'Maintien',
  PRODUCTIVE: 'Productif',
  PEAKING: 'Pic de forme',
  OVERREACHING: 'Surentraînement (overreaching)',
  UNPRODUCTIVE: 'Improductif',
  STRAINED: 'Fatigue excessive (strained)',
};

// "PRODUCTIVE_3" -> "PRODUCTIVE" -> "Productif" (le suffixe numérique est une
// nuance interne à Garmin, pas un statut différent).
function labelForTrainingStatus(phrase) {
  if (!phrase) return null;
  const key = phrase.split('_')[0];
  return TRAINING_STATUS_LABELS[key] || phrase;
}

// On calcule nous-mêmes le verdict à partir des valeurs/cibles chiffrées
// plutôt que de traduire les phrases Garmin (ex. AEROBIC_LOW_SHORTAGE) :
// on n'a vu qu'un seul exemple réel de ces phrases, alors que les chiffres
// eux-mêmes sont sans ambiguïté.
function classifyLoadRange(value, min, max) {
  if (value == null || min == null || max == null) return null;
  if (value < min) return 'insuffisant';
  if (value > max) return 'excessif';
  return 'optimal';
}

// Endpoint non documenté (voir garmin.js). Forme confirmée manuellement sur
// une vraie réponse Garmin (12/08/2026) : userId, mostRecentVO2Max.generic,
// mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap (par
// deviceId), mostRecentTrainingStatus.latestTrainingStatusData (par
// deviceId). On garde une lecture défensive malgré tout car ces champs
// peuvent varier selon la montre ou ne pas être calculés certains jours.
function summarizeTrainingStatus(data) {
  if (!data) return null;

  const statusEntries = Object.values(data.mostRecentTrainingStatus?.latestTrainingStatusData || {});
  const status = statusEntries.find((d) => d.primaryTrainingDevice) || statusEntries[0] || null;

  const balanceEntries = Object.values(data.mostRecentTrainingLoadBalance?.metricsTrainingLoadBalanceDTOMap || {});
  const balance = balanceEntries.find((d) => d.primaryTrainingDevice) || balanceEntries[0] || null;

  const vo2 = data.mostRecentVO2Max?.generic || null;
  const load = status?.acuteTrainingLoadDTO || null;

  if (!status && !balance && !vo2) return null;

  const round = (n) => (n == null ? null : Math.round(n));
  const rangeBlock = (value, min, max) =>
    value == null ? null : { value: round(value), min: round(min), max: round(max), verdict: classifyLoadRange(value, min, max) };

  return {
    vo2Max: vo2?.vo2MaxValue ?? null,
    statusLabel: labelForTrainingStatus(status?.trainingStatusFeedbackPhrase),
    acuteLoad: round(load?.dailyTrainingLoadAcute),
    chronicLoad: round(load?.dailyTrainingLoadChronic),
    loadRatio: load?.dailyAcuteChronicWorkloadRatio ?? null,
    loadStatus: load?.acwrStatus || null,
    aerobicLow: balance ? rangeBlock(balance.monthlyLoadAerobicLow, balance.monthlyLoadAerobicLowTargetMin, balance.monthlyLoadAerobicLowTargetMax) : null,
    aerobicHigh: balance ? rangeBlock(balance.monthlyLoadAerobicHigh, balance.monthlyLoadAerobicHighTargetMin, balance.monthlyLoadAerobicHighTargetMax) : null,
    anaerobic: balance ? rangeBlock(balance.monthlyLoadAnaerobic, balance.monthlyLoadAnaerobicTargetMin, balance.monthlyLoadAnaerobicTargetMax) : null,
  };
}

module.exports = { formatPace, parseGarminDate, toGarminDateString, isRunningActivity, summarizeSleep, summarizeWeight, summarizeSplits, summarizeTrainingStatus };
