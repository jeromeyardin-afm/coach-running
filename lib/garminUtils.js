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

module.exports = { formatPace, parseGarminDate, isRunningActivity };
