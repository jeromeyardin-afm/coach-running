const Anthropic = require('@anthropic-ai/sdk');
const plan = require('./plan');
const { formatDateFr, buildPlanContext, classifyByHR } = require('./planUtils');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-5';

function extractText(message) {
  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

function formatSleepBlock(sleep) {
  if (!sleep) return "Sommeil : pas de donnée disponible pour cette date.";
  const parts = [`Durée : ${sleep.duration}`];
  if (sleep.score != null) parts.push(`score ${sleep.score}/100 (${sleep.scoreQualifier})`);
  if (sleep.restingHeartRate != null) parts.push(`FC repos mesurée cette nuit : ${sleep.restingHeartRate} bpm`);
  if (sleep.avgOvernightHrv != null) parts.push(`HRV moyenne : ${sleep.avgOvernightHrv} ms (statut : ${sleep.hrvStatus})`);
  if (sleep.bodyBatteryChange != null) parts.push(`Body Battery récupérée pendant la nuit : +${sleep.bodyBatteryChange}`);
  return `Sommeil (nuit précédant/du jour de la séance) : ${parts.join(', ')}.`;
}

function formatSplitsBlock(splits) {
  if (!splits) return '';
  const lines = splits.map((s) => `- Segment ${s.segment} : ${s.distanceKm} km à ${s.pace}/km${s.avgHR ? ` (FC ${s.avgHR} bpm)` : ''}`).join('\n');
  return `\nDétail par segment/tour (utilise ceci en priorité sur la moyenne globale — une moyenne peut masquer une structure du type échauffement facile + portion qualité) :\n${lines}\n`;
}

function formatActivitySplitsInline(splits) {
  if (!splits) return '';
  const parts = splits.map((s) => `${s.distanceKm}km à ${s.pace}/km${s.avgHR ? ` (FC ${s.avgHR})` : ''}`).join(' + ');
  return ` [détail : ${parts}]`;
}

function formatTrainingStatusBlock(status) {
  if (!status) return '';
  const parts = [];
  if (status.vo2Max != null) parts.push(`VO2max mesuré : ${status.vo2Max}`);
  if (status.statusLabel) parts.push(`Statut d'entraînement Garmin : ${status.statusLabel}`);
  if (status.acuteLoad != null && status.chronicLoad != null) {
    parts.push(`Charge aiguë/chronique : ${status.acuteLoad}/${status.chronicLoad} (ratio ${status.loadRatio ?? 'n/a'}, statut ${status.loadStatus || 'n/a'})`);
  }
  const balanceLines = [];
  if (status.aerobicLow) balanceLines.push(`aérobie faible ${status.aerobicLow.value} (cible ${status.aerobicLow.min}-${status.aerobicLow.max}) → ${status.aerobicLow.verdict}`);
  if (status.aerobicHigh) balanceLines.push(`aérobie élevée ${status.aerobicHigh.value} (cible ${status.aerobicHigh.min}-${status.aerobicHigh.max}) → ${status.aerobicHigh.verdict}`);
  if (status.anaerobic) balanceLines.push(`anaérobie ${status.anaerobic.value} (cible ${status.anaerobic.min}-${status.anaerobic.max}) → ${status.anaerobic.verdict}`);
  if (balanceLines.length > 0) parts.push(`Équilibre de charge mensuel (Garmin) : ${balanceLines.join(', ')}`);

  if (parts.length === 0) return '';
  return `\nStatut d'entraînement Garmin (instantané au moment du rapport) :\n${parts.map((p) => `- ${p}`).join('\n')}\n`;
}

function formatDynamicsBlock(dynamics) {
  if (!dynamics) return '';
  const parts = [];
  if (dynamics.groundContactTimeMs != null) parts.push(`temps de contact au sol ${dynamics.groundContactTimeMs} ms`);
  if (dynamics.verticalOscillationCm != null) parts.push(`oscillation verticale ${dynamics.verticalOscillationCm} cm`);
  if (dynamics.verticalRatioPercent != null) parts.push(`ratio vertical ${dynamics.verticalRatioPercent}%`);
  if (dynamics.trainingEffect != null) parts.push(`training effect aérobie ${dynamics.trainingEffect}/5 (${dynamics.trainingEffectLabel})`);
  if (dynamics.anaerobicTrainingEffect != null) parts.push(`training effect anaérobie ${dynamics.anaerobicTrainingEffect}/5 (${dynamics.anaerobicTrainingEffectLabel})`);
  if (parts.length === 0) return '';
  return `\nDynamique de course : ${parts.join(', ')}.\n`;
}

function formatActivityDynamicsInline(dynamics) {
  if (!dynamics) return '';
  const parts = [];
  if (dynamics.trainingEffect != null) parts.push(`TE aéro ${dynamics.trainingEffect}/5`);
  if (dynamics.groundContactTimeMs != null) parts.push(`contact sol ${dynamics.groundContactTimeMs}ms`);
  if (dynamics.verticalOscillationCm != null) parts.push(`osc. verticale ${dynamics.verticalOscillationCm}cm`);
  if (parts.length === 0) return '';
  return ` [dynamique : ${parts.join(', ')}]`;
}

function formatWeeklyStatsBlock(stats) {
  if (!stats) return '';
  const lines = [];

  if (stats.zoneDistribution && stats.zoneDistribution.length > 0) {
    lines.push(`Répartition du volume par zone : ${stats.zoneDistribution.map((z) => `${z.zone} ${z.km}km (${z.percent}%)`).join(', ')}`);
  }
  if (stats.maxHRObserved != null) {
    lines.push(`FC max observée cette semaine : ${stats.maxHRObserved} bpm (théorique ${plan.physiology.maxHeartRate} bpm)`);
  }
  if (stats.longRun) {
    const elev = stats.longRun.elevationGain != null ? `, +${stats.longRun.elevationGain}m D+` : '';
    lines.push(`Sortie longue de la semaine : ${stats.longRun.date} — ${stats.longRun.distanceKm} km à ${stats.longRun.pace}/km${elev}`);
  }
  if (stats.restDays != null) {
    lines.push(`Jours de repos vs actifs : ${stats.restDays} repos / ${7 - stats.restDays} actifs`);
  }
  if (stats.weekOverWeek) {
    const w = stats.weekOverWeek;
    const sign = (n) => (n >= 0 ? '+' : '');
    lines.push(`Vs semaine précédente : ${sign(w.deltaKm)}${w.deltaKm} km (${sign(w.deltaPercent)}${w.deltaPercent}%), ${sign(w.deltaSessions)}${w.deltaSessions} séance(s)`);
  }

  if (lines.length === 0) return '';
  return `\nStatistiques hebdo calculées (utilise ces chiffres directement, ne les redérive pas) :\n${lines.map((l) => `- ${l}`).join('\n')}\n`;
}

function formatWeightBlock(weight) {
  if (!weight) return '';
  const bodyFat = weight.bodyFatPercent != null ? `, masse grasse ${weight.bodyFatPercent}%` : '';
  return `\nPoids le jour du bilan : ${weight.weightKg} kg${bodyFat} (à mettre en perspective avec la stratégie de déficit léger, jamais un objectif en soi).`;
}

class CoachMarathon {
  async analyzeActivity(activity, sleep = null, splits = null, trainingStatus = null, dynamics = null) {
    const detectedZone = classifyByHR(activity.avgHR);
    const prompt = `Tu es un coach marathon expert. Analyse cette activité de course à pied et donne des conseils spécifiques pour préparer ${plan.marathon.name} le ${formatDateFr(plan.marathon.date)} avec un objectif de ${plan.marathon.objective}.

Données de l'activité :
- Distance: ${activity.distance} km
- Durée: ${activity.duration} min
- Allure moyenne: ${activity.pace} /km
- FC moyenne: ${activity.avgHR} bpm → zone détectée : ${detectedZone}
- FC max: ${activity.maxHR} bpm
- Cadence moyenne: ${activity.cadence || 'n/a'} pas/min
- Dénivelé: +${activity.elevation} m
- Type: ${activity.type}
- Date: ${activity.date}
${formatSplitsBlock(splits)}
${formatDynamicsBlock(dynamics)}
${formatSleepBlock(sleep)}
${formatTrainingStatusBlock(trainingStatus)}

${buildPlanContext()}

Important : pour juger de l'intensité de cette séance, base-toi uniquement sur la zone détectée ci-dessus (dérivée des zones FC personnalisées de cet athlète), jamais sur un pourcentage brut de FC max théorique — un effort peut représenter 70-75% de la FC max tout en étant parfaitement dans la zone de récupération pour cet athlète spécifique. Si un détail par segment est fourni, analyse chaque segment séparément (ex. échauffement facile puis portion à allure qualité) plutôt que de juger la séance sur sa seule moyenne globale, qui peut masquer une structure délibérée. Si l'équilibre de charge Garmin signale un manque de charge aérobie faible (volume facile insuffisant), priorise des conseils qui favorisent le volume facile plutôt que d'ajouter de l'intensité, même si le volume hebdo semble par ailleurs correct.

Donne un feedback court et actionnable (3-4 points max) :
1. Comment s'est passée cette séance vs le plan (la zone détectée — ou le détail par segment si disponible — correspond-elle à ce qui était prévu ce jour) ?
2. Signaux positifs ou alertes à surveiller ?
3. Un conseil spécifique pour les prochains jours
4. Hydratation/nutrition si besoin`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return extractText(message);
    } catch (error) {
      console.error('Erreur Claude API:', error.message);
      throw error;
    }
  }

  async generateWeeklyReport(activities, weeklyProgress = [], weight = null, trainingStatus = null, weeklyStats = null) {
    const progressTable = weeklyProgress
      .map((w) => {
        const ecart = w.plannedKm != null ? `${w.actualKm >= w.plannedKm ? '+' : ''}${Math.round(((w.actualKm - w.plannedKm) / w.plannedKm) * 100)}%` : 'n/a';
        return `- Semaine ${w.week} (${w.focus || '—'}) : ${w.actualKm} km réalisés vs ${w.plannedKm ?? '?'} km prévus (${ecart}), ${w.sessionsCount}/${w.plannedSessionsPerWeek} séances de course`;
      })
      .join('\n');

    const prompt = `Tu es un coach marathon. Voici les activités de la semaine de cet athlète qui prépare ${plan.marathon.name} (${formatDateFr(plan.marathon.date)}, objectif ${plan.marathon.objective}).

Activités de la semaine :
${activities.map(a => `- ${a.date} : ${a.type} ${a.distance}km à ${a.pace}/km (FC ${a.avgHR} bpm, zone ${classifyByHR(a.avgHR)}, cadence ${a.cadence || 'n/a'} pas/min)${formatActivitySplitsInline(a.splits)}${formatActivityDynamicsInline(a.dynamics)}`).join('\n')}
${formatWeeklyStatsBlock(weeklyStats)}
Historique réalisé vs prévu depuis le début du plan (volume de course uniquement) :
${progressTable}
${formatWeightBlock(weight)}
${formatTrainingStatusBlock(trainingStatus)}

${buildPlanContext()}

Important : pour juger de l'intensité de chaque séance, base-toi uniquement sur la zone indiquée à côté de chaque FC (dérivée des zones personnalisées de cet athlète), jamais sur un pourcentage brut de FC max théorique. Quand un détail [détail : ...] est présent à côté d'une activité, analyse cette séance segment par segment (ex. échauffement facile puis portion à allure qualité) plutôt que sur sa seule moyenne globale, qui peut masquer une structure délibérée et faire passer une séance conforme au plan pour une séance trop rapide ou trop soutenue. Si l'équilibre de charge Garmin signale un manque de charge aérobie faible ou un excès anaérobie, mentionne-le explicitement dans les points d'amélioration/ajustements — c'est un signal indépendant du simple respect du volume prévu, et il peut expliquer une fatigue même quand le volume hebdo semble correct.

Style : reste factuel et concis, pas littéraire. Pour la description des activités individuelles en particulier, une ligne courte par séance — chiffres + verdict en quelques mots, pas un paragraphe qui explique/interprète chaque segment en prose. Exemple de niveau de détail attendu : "11/08 : 8,64km — 1,6km éch. facile + 5,3km tempo à 4:41 (FC174, conforme) + 1,7km retour au calme". Pas de tournures du type "il est intéressant de noter que", pas de superlatifs, pas de reformulation d'un chiffre qui vient d'être donné. Même consigne pour le reste du rapport : direct, sans remplissage.

Génère un rapport hebdo avec ces sections :
1. **Résumé de la semaine** : volume et charge d'entraînement, une ligne par activité (voir consigne de style ci-dessus), séances de qualité faites vs prévues (compare aux allures cibles de la séance qualité prévue cette semaine). Intègre la répartition par zone, la sortie longue, les jours de repos et la comparaison vs semaine précédente depuis les statistiques hebdo calculées ci-dessus
2. **Progression globale vers l'objectif** : en te basant sur tout l'historique réalisé vs prévu ci-dessus, quelle est la tendance ? Est-il en avance, dans les clous, ou en retard sur le plan ? Le potentiel marathon estimé (${plan.physiology.semiMarathonRecord.predictedMarathonPotential}) reste-t-il crédible au vu de l'exécution jusqu'ici ?
3. **Points d'amélioration** : 2-3 points concrets et priorisés, pas une liste exhaustive
4. **Ajustements pour la semaine à venir**
5. Un mot d'encouragement (court, 1-2 phrases)`;

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return extractText(message);
    } catch (error) {
      console.error('Erreur Claude API:', error.message);
      throw error;
    }
  }
}

module.exports = CoachMarathon;
