const plan = require('./plan');
const schedule = require('./schedule');

function formatDateFr(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Calculée à partir de startDate plutôt que stockée en dur, pour ne jamais
// être en décalage avec la date réelle.
function getTrainingWeek(referenceDate = new Date()) {
  const start = new Date(`${plan.trainingPlan.startDate}T00:00:00Z`);
  const diffDays = Math.floor((referenceDate - start) / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(week, 1), plan.trainingPlan.totalWeeks);
}

function getWeekType(week) {
  if (plan.trainingPlan.peakWeeks.includes(week)) return 'semaine de pic';
  if (plan.trainingPlan.taperWeeks.includes(week)) return "semaine d'affûtage";
  if (plan.trainingPlan.cutbackWeeks.includes(week)) return 'semaine de récupération (cutback)';
  return 'semaine standard';
}

function getWeekSchedule(week) {
  return schedule.find((w) => w.week === week) || null;
}

function buildPlanContext(referenceDate = new Date()) {
  const week = getTrainingWeek(referenceDate);
  const weekType = getWeekType(week);
  const p = plan.running.paces;
  const weekSchedule = getWeekSchedule(week);

  const scheduleBlock = weekSchedule
    ? `

Séances prévues cette semaine (focus : ${weekSchedule.focus}) :
- Séance qualité : ${weekSchedule.qualitySession}
- Sortie longue : ${weekSchedule.longRun}
- Volume total visé : ~${weekSchedule.volumeKm} km`
    : '';

  return `Profil de l'athlète : ${plan.athlete.name}
Course cible : ${plan.marathon.name}, le ${formatDateFr(plan.marathon.date)}, objectif ${plan.marathon.objective} (${plan.marathon.objectivePace})

Physiologie :
- Seuil lactique : ${plan.physiology.lactateThreshold} bpm
- FC max : ${plan.physiology.maxHeartRate} bpm
- FC repos : ${plan.physiology.restingHeartRate} bpm
- VO2max estimé : ${plan.physiology.vo2maxEstimate}
- Record semi-marathon : ${plan.physiology.semiMarathonRecord.time} (${plan.physiology.semiMarathonRecord.pace}), potentiel marathon prédit : ${plan.physiology.semiMarathonRecord.predictedMarathonPotential}

Plan d'entraînement : semaine ${week}/${plan.trainingPlan.totalWeeks} (${weekType}), ${plan.trainingPlan.sessionsPerWeek} séances/semaine${scheduleBlock}

Structure hebdomadaire habituelle :
${plan.weeklyStructure.map((d) => `- ${d.day} : ${d.type} (${d.example})`).join('\n')}

Allures de référence (min/km) :
- Facile : ${p.easy.min}-${p.easy.max} (FC ${p.easy.bpm})
- Endurance : ${p.endurance.min}-${p.endurance.max} (FC ${p.endurance.bpm})
- Marathon : ${p.marathon.min}-${p.marathon.max} (FC ${p.marathon.bpm})
- Tempo : ${p.tempo.min}-${p.tempo.max} (FC ${p.tempo.bpm})
- VMA : ${p.vma.min}-${p.vma.max} (FC ${p.vma.bpm})

Points d'attention personnels :
${plan.notes.map((n) => `- ${n}`).join('\n')}

Contexte : ${plan.context.targetLossStrategy}`;
}

module.exports = { formatDateFr, getTrainingWeek, getWeekType, getWeekSchedule, buildPlanContext };
