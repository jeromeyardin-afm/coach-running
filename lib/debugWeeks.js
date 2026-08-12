const GarminClient = require('./garmin');
const plan = require('./plan');
const schedule = require('./schedule');
const { formatPace, parseGarminDate, isRunningActivity } = require('./garminUtils');
const { getTrainingWeek } = require('./planUtils');

const ACTIVITY_FETCH_LIMIT = Number(process.env.WEEKLY_ACTIVITY_LIMIT || 150);

// Route de diagnostic : affiche le détail brut de chaque activité et la
// semaine calculée pour chacune, sans appeler Claude ni envoyer d'email.
// Sert à vérifier que le calcul de volume réalisé/prévu est juste.
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
    const planStart = new Date(`${plan.trainingPlan.startDate}T00:00:00Z`);

    const allActivities = (activities || []).map((a) => {
      const date = parseGarminDate(a.startTimeGMT);
      const running = isRunningActivity(a.activityType?.typeKey);
      return {
        name: a.activityName,
        typeKey: a.activityType?.typeKey || null,
        countedAsRunning: running,
        dateISO: date.toISOString(),
        dateLocalFr: date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
        distanceKm: Math.round((a.distance / 1000) * 100) / 100,
        pace: running ? formatPace(a.distance, a.duration) : null,
        week: running ? getTrainingWeek(date) : null,
        beforePlanStart: date.getTime() < planStart.getTime(),
      };
    });

    const runningActivities = allActivities.filter((a) => a.countedAsRunning && !a.beforePlanStart);

    const byWeek = new Map();
    for (const a of runningActivities) {
      if (!byWeek.has(a.week)) byWeek.set(a.week, []);
      byWeek.get(a.week).push(a);
    }

    const currentWeek = getTrainingWeek();
    const weeklyBreakdown = [];
    for (let w = 1; w <= currentWeek; w += 1) {
      const weekRuns = byWeek.get(w) || [];
      const weekSchedule = schedule.find((s) => s.week === w);
      weeklyBreakdown.push({
        week: w,
        plannedKm: weekSchedule ? weekSchedule.volumeKm : null,
        actualKm: Math.round(weekRuns.reduce((sum, r) => sum + r.distanceKm, 0) * 10) / 10,
        activities: weekRuns.map((r) => ({
          date: r.dateLocalFr,
          distanceKm: r.distanceKm,
          pace: r.pace,
          typeKey: r.typeKey,
        })),
      });
    }

    return res.status(200).json({
      planStartDate: plan.trainingPlan.startDate,
      currentWeek,
      totalActivitiesFetched: allActivities.length,
      weeklyBreakdown,
      excludedActivities: allActivities.filter((a) => !a.countedAsRunning),
    });
  } catch (error) {
    console.error('❌ Erreur debug:', error.message);
    return res.status(500).json({ error: error.message, success: false });
  }
};
