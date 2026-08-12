const GarminClient = require('./garmin');
const CoachMarathon = require('./claude-coach');
const EmailSender = require('./email');
const plan = require('./plan');
const schedule = require('./schedule');
const { formatPace, parseGarminDate, isRunningActivity, summarizeWeight, summarizeSplits, summarizeTrainingStatus, summarizeRunningDynamics } = require('./garminUtils');
const { getTrainingWeek, getPlanStartMonday, summarizeZoneDistribution } = require('./planUtils');

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

    const planStart = getPlanStartMonday();
    const currentWeek = getTrainingWeek();

    // Toutes les activités de course depuis le début du plan, groupées par
    // semaine d'entraînement (calculée à partir de leur propre date).
    const runsSinceStart = (activities || [])
      .filter((a) => isRunningActivity(a.activityType?.typeKey))
      .map((a) => {
        const date = parseGarminDate(a.startTimeGMT);
        return {
          week: getTrainingWeek(date),
          activityId: a.activityId,
          type: a.activityType?.typeKey || 'running',
          distanceKm: a.distance / 1000,
          pace: formatPace(a.distance, a.duration),
          avgHR: a.averageHR || 0,
          maxHR: a.maxHR || 0,
          elevationGain: Math.round(a.elevationGain || 0),
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
    // Le plan compte 4 séances "courtes" (2 qualité + 2 easy) séparément de
    // la sortie longue (1) — on distingue donc les deux plutôt que de tout
    // regrouper dans un seul total, ce qui affichait "5/4" sur une semaine
    // par ailleurs conforme. La sortie longue est présumée être la plus
    // longue course de la semaine (même heuristique que weeklyStats.longRun).
    const weeklyProgress = [];
    for (let w = 1; w <= currentWeek; w += 1) {
      const weekRuns = runsByWeek.get(w) || [];
      const actualKm = weekRuns.reduce((sum, r) => sum + r.distanceKm, 0);
      const weekSchedule = schedule.find((s) => s.week === w);
      weeklyProgress.push({
        week: w,
        actualKm: Math.round(actualKm * 10) / 10,
        plannedKm: weekSchedule ? weekSchedule.volumeKm : null,
        shortSessionsCount: weekRuns.length > 0 ? weekRuns.length - 1 : 0,
        longRunCompleted: weekRuns.length > 0,
        plannedSessionsPerWeek: plan.trainingPlan.sessionsPerWeek,
        focus: weekSchedule ? weekSchedule.focus : null,
      });
    }

    const thisWeekRuns = runsByWeek.get(currentWeek) || [];
    const thisWeekActivities = [];
    for (const r of thisWeekRuns) {
      let splits = null;
      try {
        splits = summarizeSplits(await garmin.getActivitySplits(r.activityId));
      } catch (error) {
        console.log('Pas de détail par segment disponible pour cette activité:', error.message);
      }
      let dynamics = null;
      try {
        dynamics = summarizeRunningDynamics(await garmin.getActivityDetails(r.activityId));
      } catch (error) {
        console.log('Pas de dynamique de course disponible pour cette activité:', error.message);
      }
      thisWeekActivities.push({
        type: r.type,
        distance: r.distanceKm.toFixed(2),
        pace: r.pace,
        avgHR: r.avgHR,
        cadence: r.cadence,
        date: r.dateFr,
        splits,
        dynamics,
      });
    }

    // Statistiques déterministes calculées côté code plutôt que laissées à
    // l'appréciation du modèle, pour rester cohérentes semaine après semaine.
    // Réutilise les splits déjà récupérés ci-dessus pour une répartition par
    // zone au niveau du segment plutôt que de la seule moyenne d'activité.
    const zoneDistribution = summarizeZoneDistribution(
      thisWeekActivities.map((a) => ({ distanceKm: Number(a.distance), avgHR: a.avgHR, splits: a.splits }))
    );
    const maxHRValues = thisWeekRuns.map((r) => r.maxHR).filter((v) => v > 0);
    const maxHRObserved = maxHRValues.length > 0 ? Math.max(...maxHRValues) : null;
    const longRunSource = thisWeekRuns.length > 0
      ? thisWeekRuns.reduce((longest, r) => (r.distanceKm > longest.distanceKm ? r : longest), thisWeekRuns[0])
      : null;
    const longRun = longRunSource
      ? {
          date: longRunSource.dateFr,
          distanceKm: Math.round(longRunSource.distanceKm * 100) / 100,
          pace: longRunSource.pace,
          elevationGain: longRunSource.elevationGain,
        }
      : null;
    const activeDaysCount = new Set(thisWeekRuns.map((r) => r.date.toDateString())).size;
    const restDays = 7 - activeDaysCount;

    const thisWeekEntry = weeklyProgress[weeklyProgress.length - 1];
    const previousWeekEntry = weeklyProgress[weeklyProgress.length - 2];
    const weekOverWeek = thisWeekEntry && previousWeekEntry
      ? {
          deltaKm: Math.round((thisWeekEntry.actualKm - previousWeekEntry.actualKm) * 10) / 10,
          deltaPercent: previousWeekEntry.actualKm > 0
            ? Math.round(((thisWeekEntry.actualKm - previousWeekEntry.actualKm) / previousWeekEntry.actualKm) * 100)
            : null,
          deltaSessions: thisWeekEntry.shortSessionsCount - previousWeekEntry.shortSessionsCount,
        }
      : null;

    // Si le rapport est généré avant la fin de la semaine ISO (dimanche
    // 23:59:59 UTC) — par ex. un déclenchement manuel en semaine — le coach
    // doit parler de séances "restant à faire d'ici dimanche" plutôt que
    // "manquées", et proposer de compléter la semaine plutôt que de clore
    // le bilan comme si elle était terminée.
    const currentWeekMonday = new Date(planStart.getTime() + (currentWeek - 1) * 7 * 24 * 60 * 60 * 1000);
    const currentWeekSundayEnd = new Date(currentWeekMonday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    const now = new Date();
    const weekComplete = now.getTime() > currentWeekSundayEnd.getTime();
    const daysRemaining = weekComplete
      ? 0
      : Math.max(0, Math.ceil((currentWeekSundayEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    const weeklyStats = { zoneDistribution, maxHRObserved, longRun, restDays, weekOverWeek, weekComplete, daysRemaining };

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

    let trainingStatus = null;
    try {
      trainingStatus = summarizeTrainingStatus(await garmin.getTrainingStatus());
    } catch (error) {
      console.log('Pas de statut d\'entraînement disponible:', error.message);
    }

    const coach = new CoachMarathon();
    const report = await coach.generateWeeklyReport(thisWeekActivities, weeklyProgress, weight, trainingStatus, weeklyStats);

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
