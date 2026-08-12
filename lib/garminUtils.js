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

module.exports = { formatPace, parseGarminDate, isRunningActivity, summarizeSleep, summarizeWeight, summarizeSplits };
