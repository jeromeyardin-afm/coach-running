const GarminClient = require('./garmin');
const { formatPace, parseGarminDate, isRunningActivity, summarizeSplits } = require('./garminUtils');
const { getTrainingWeek, getPlanStartMonday, classifyByHR, classifySegment, summarizeZoneDistribution, SHORT_SEGMENT_THRESHOLD_SECONDS } = require('./planUtils');

const ACTIVITY_FETCH_LIMIT = Number(process.env.WEEKLY_ACTIVITY_LIMIT || 150);

// Route de diagnostic : pour chaque activité de course depuis le début du
// plan, affiche la FC moyenne, la zone qu'elle donnerait seule (sans
// segments), le détail brut par segment quand disponible, et la
// répartition par zone réellement utilisée dans le bilan hebdo — pour
// vérifier activité par activité que la classification est correcte.
// Lecture seule (pas d'appel Claude ni d'email).
module.exports = async (req, res) => {
  try {
    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );

    const activities = await garmin.getActivities(ACTIVITY_FETCH_LIMIT);
    const planStart = getPlanStartMonday();

    const runs = (activities || [])
      .filter((a) => isRunningActivity(a.activityType?.typeKey))
      .map((a) => ({ activity: a, date: parseGarminDate(a.startTimeGMT) }))
      .filter(({ date }) => date.getTime() >= planStart.getTime())
      .sort((a, b) => a.date - b.date);

    const results = [];
    for (const { activity: a, date } of runs) {
      const avgHR = a.averageHR || 0;
      const distanceKm = Math.round((a.distance / 1000) * 100) / 100;

      let splits = null;
      let splitsError = null;
      try {
        splits = summarizeSplits(await garmin.getActivitySplits(a.activityId));
      } catch (error) {
        splitsError = error.message;
      }

      const zoneDistribution = summarizeZoneDistribution([{ distanceKm, avgHR, splits }]);

      // Annote chaque segment avec la méthode de classification effective
      // (allure pour les segments < 90s, FC sinon) et la zone qui en
      // résulte, pour vérifier précisément pourquoi chaque segment est
      // classé comme il l'est.
      const segmentsAnnotes = splits
        ? splits.map((seg) => ({
            ...seg,
            classifiedBy: seg.durationSeconds != null && seg.durationSeconds < SHORT_SEGMENT_THRESHOLD_SECONDS ? 'allure (segment court)' : 'FC',
            zone: classifySegment(seg),
          }))
        : null;

      results.push({
        date: date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
        week: getTrainingWeek(date),
        name: a.activityName,
        distanceKm,
        pace: formatPace(a.distance, a.duration),
        avgHR,
        wholeActivityZone: avgHR > 0 ? classifyByHR(avgHR) : null,
        hasSplits: !!splits,
        splitsError,
        segments: segmentsAnnotes,
        zoneDistributionUtilisee: zoneDistribution,
      });
    }

    return res.status(200).json({ totalActivities: results.length, activities: results });
  } catch (error) {
    console.error('❌ Erreur debug-zones:', error.message);
    return res.status(500).json({ error: error.message, success: false });
  }
};
