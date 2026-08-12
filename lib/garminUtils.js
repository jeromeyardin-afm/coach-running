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

module.exports = { formatPace, parseGarminDate };
