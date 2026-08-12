const GarminClient = require('./garmin');
const CoachMarathon = require('./claude-coach');
const EmailSender = require('./email');
const plan = require('./plan');
const schedule = require('./schedule');
const { formatPace, parseGarminDate, isRunningActivity, summarizeWeight } = require('./garminUtils');
const { getTrainingWeek } = require('./planUtils');

// Assez de marge pour couvrir tout le plan depuis le début (13 semaines,
// jusqu'à ~6 séances/semaine course + natation).
const ACTIVITY_FETCH_LIMIT = Number(process.env.WEEKLY_ACTIVITY_LIMIT || 150);

module.exports = async (req, res) => {
  try {
    console.log('📅 Génération du bilan hebdomadaire...');

    if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
      throw new Error('Variables Garmin manquantes');
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Clé API Anthropic manquante');
    }

    const garmin = new GarminClient(
      process.env.GARMIN_EMAIL,
      process.env.GARMIN_PASSWORD
    );

    const activities = await garmin.getActivities(ACTIVITY_FETCH_LIMIT);

    const planStart = new Date(`${plan.trainingPlan.startDate}T00:00:00Z`);
    const currentWeek = getTrainingWeek();

    // Toutes les activités de course depuis le début du plan, groupées par
    // semaine d'entraînement (calculée à partir de leur propre date).
    const runsSinceStart = (activities || [])
      .filter((a) => isRunningActivity(a.activityType?.typeKey))
      .map((a) => {
        const date = parseGarminDate(a.startTimeGMT);
        return {
          week: getTrainingWeek(date),
          type: a.activityType?.typeKey || 'running',
          distanceKm: a.distance / 1000,
          pace: formatPace(a.distance, a.duration),
          avgHR: a.averageHR || 0,
          cadence: Math.round(a.averageRunningCadenceInStepsPerMinute || 0),
          date,
          dateFr: date.toLocaleDateString('fr-FR'),
        };
      })
      .filter((a) => a.date.getTime() >= planStart.getTime())
      .sort((a, b) => a.date - b.date);

    if (runsSinceStart.length === 0) {
      console.log('Aucune activité cette semaine');
      return res.status(200).json({ message: 'Aucune activité cette semaine' });
    }

    const runsByWeek = new Map();
    for (const run of runsSinceStart) {
      if (!runsByWeek.has(run.week)) runsByWeek.set(run.week, []);
      runsByWeek.get(run.week).push(run);
    }

    // Réalisé vs prévu, semaine par semaine, jusqu'à la semaine en cours.
    const weeklyProgress = [];
    for (let w = 1; w <= currentWeek; w += 1) {
      const weekRuns = runsByWeek.get(w) || [];
      const actualKm = weekRuns.reduce((sum, r) => sum + r.distanceKm, 0);
      const weekSchedule = schedule.find((s) => s.week === w);
      weeklyProgress.push({
        week: w,
        actualKm: Math.round(actualKm * 10) / 10,
        plannedKm: weekSchedule ? weekSchedule.volumeKm : null,
        sessionsCount: weekRuns.length,
        plannedSessionsPerWeek: plan.trainingPlan.sessionsPerWeek,
        focus: weekSchedule ? weekSchedule.focus : null,
      });
    }

    const thisWeekActivities = (runsByWeek.get(currentWeek) || []).map((r) => ({
      type: r.type,
      distance: r.distanceKm.toFixed(2),
      pace: r.pace,
      avgHR: r.avgHR,
      cadence: r.cadence,
      date: r.dateFr,
    }));

    if (thisWeekActivities.length === 0) {
      console.log('Aucune activité cette semaine');
      return res.status(200).json({ message: 'Aucune activité cette semaine' });
    }

    console.log(`🎯 ${thisWeekActivities.length} activité(s) cette semaine, historique sur ${weeklyProgress.length} semaine(s)`);

    let weight = null;
    try {
      weight = summarizeWeight(await garmin.getDailyWeightData());
    } catch (error) {
      console.log('Pas de pesée disponible aujourd\'hui:', error.message);
    }

    const coach = new CoachMarathon();
    const report = await coach.generateWeeklyReport(thisWeekActivities, weeklyProgress, weight);

    const emailSender = new EmailSender();

    await emailSender.sendWeeklyReport(
      process.env.EMAIL_DESTINATAIRE || plan.athlete.email,
      `📅 Coach Marathon - Bilan semaine ${currentWeek}`,
      report,
      thisWeekActivities
    );

    console.log('✅ Bilan hebdo envoyé avec succès');
    return res.status(200).json({
      success: true,
      activitiesInWeek: thisWeekActivities.length,
      weeksTracked: weeklyProgress.length,
    });
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
};
