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

// Lundi de la semaine ISO (lundi-dimanche) contenant startDate. startDate
// (21 juillet) tombe un mardi ; sans cet alignement, les "semaines" du plan
// démarraient le mardi et étaient décalées d'un jour par rapport aux
// semaines que Garmin (et l'app Garmin Connect) affichent — d'où des
// totaux hebdo qui ne correspondaient pas à ce que l'athlète voyait.
function getPlanStartMonday() {
  const start = new Date(`${plan.trainingPlan.startDate}T00:00:00Z`);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7; // lundi = 0
  return new Date(start.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
}

// Calculée à partir de startDate plutôt que stockée en dur, pour ne jamais
// être en décalage avec la date réelle. Alignée sur des semaines ISO
// (lundi-dimanche) pour correspondre aux semaines de Garmin Connect.
function getTrainingWeek(referenceDate = new Date()) {
  const start = getPlanStartMonday();
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

// Bornes FC alignées sur plan.running.paces.*.bpm. Sert à trancher
// objectivement la zone d'une séance à partir de la FC moyenne, plutôt que
// de laisser le modèle raisonner en % de FC max théorique (ce qui a produit
// une analyse fausse : 143 bpm classé comme "proche du seuil" alors que
// c'est en plein dans la zone facile/récupération pour cet athlète).
const HR_ZONES = [
  { name: 'Récupération / Facile', maxHR: 150 },
  { name: 'Endurance fondamentale', maxHR: 165 },
  { name: 'Allure marathon', maxHR: 175 },
  { name: 'Tempo / Seuil', maxHR: 183 },
  { name: 'VMA / Fractionné court', maxHR: Infinity },
];

function classifyByHR(avgHR) {
  const zone = HR_ZONES.find((z) => avgHR <= z.maxHR);
  return zone.name;
}

// % du volume hebdo par zone FC. Utilise le détail par segment quand il est
// disponible (une séance qualité = échauffement facile + portion seuil doit
// compter dans deux zones différentes, pas une seule zone moyenne), sinon
// retombe sur la FC moyenne de l'activité entière.
function summarizeZoneDistribution(runs) {
  const kmByZone = new Map();
  let total = 0;

  for (const run of runs) {
    const segments = run.splits && run.splits.length > 0
      ? run.splits
      : [{ distanceKm: run.distanceKm, avgHR: run.avgHR }];
    for (const seg of segments) {
      if (!seg.avgHR || !seg.distanceKm) continue;
      const zone = classifyByHR(seg.avgHR);
      kmByZone.set(zone, (kmByZone.get(zone) || 0) + seg.distanceKm);
      total += seg.distanceKm;
    }
  }

  if (total === 0) return [];

  return HR_ZONES.map((z) => z.name)
    .map((zone) => ({
      zone,
      km: Math.round((kmByZone.get(zone) || 0) * 10) / 10,
      percent: Math.round(((kmByZone.get(zone) || 0) / total) * 100),
    }))
    .filter((z) => z.km > 0);
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

module.exports = { formatDateFr, getTrainingWeek, getWeekType, getWeekSchedule, getPlanStartMonday, classifyByHR, summarizeZoneDistribution, buildPlanContext };
