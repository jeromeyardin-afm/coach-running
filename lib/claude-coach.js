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
    const percentText = w.deltaPercent != null ? `${sign(w.deltaPercent)}${w.deltaPercent}%` : 'n/a (semaine précédente à 0 km)';
    lines.push(`Vs semaine précédente : ${sign(w.deltaKm)}${w.deltaKm} km (${percentText}), ${sign(w.deltaSessions)}${w.deltaSessions} séance(s) courte(s)`);
  }
  if (stats.weekComplete === false) {
    lines.push(`Semaine EN COURS, pas terminée : encore ${stats.daysRemaining} jour(s) avant dimanche minuit. Ne pas parler de séances "manquées" au passé — dire "restant à faire d'ici dimanche" et proposer explicitement de compléter la semaine avec les séances du plan non encore réalisées`);
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
    const prompt = `Tu es un coach marathon expert, bienveillant et pragmatique. Analyse cette activité de course à pied et donne des conseils spécifiques pour préparer ${plan.marathon.name} le ${formatDateFr(plan.marathon.date)} avec un objectif de ${plan.marathon.objective}.

Philosophie de coaching : le plan fixe une direction générale (volume, équilibre qualité/facile, progression), pas une recette rigide à suivre format par format. Une séance qui apporte de la valeur d'entraînement (volume facile, récupération, travail de capacité) a sa place même si elle ne correspond pas exactement au format nommé ce jour-là — les écarts ponctuels sont normaux, la vie réelle s'invite dans un plan de 13 semaines. Ce qui compte, c'est la trajectoire générale (charge, équilibre, progression), pas la conformité stricte séance par séance. Ne signale un écart comme un problème que s'il nuit réellement à l'entraînement (ex. intensité excessive en semaine de récupération, dérive du volume sur plusieurs semaines) — jamais comme une non-conformité en soi.

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

Style : réponds en points courts, une ligne chacun — pas de paragraphe narratif, pas de tournures du type "il est intéressant de noter que" ou "on observe que", pas de réintroduction en prose d'un chiffre déjà donné ci-dessus. Direct et factuel, chiffres + verdict.

Donne un feedback court et actionnable, chaque point en 1-2 phrases courtes maximum :
1. Cette séance a-t-elle apporté de la valeur d'entraînement (volume facile, récupération, travail de capacité...) et s'insère-t-elle logiquement dans la semaine ? Utilise la zone détectée — ou le détail par segment si disponible — pour éclairer cette analyse, pas pour pointer un écart de format comme une alerte en soi
2. Signaux positifs ou alertes à surveiller (uniquement des signaux physiologiques ou d'entraînement réels — fatigue, dérive de FC, charge déséquilibrée — pas un simple écart au format nommé)
3. Hydratation/nutrition si besoin

Termine ensuite par cette section, sous ce format exact :

## Prochaine séance recommandée
- **Quand** : [demain / surlendemain / selon ressenti]
- **Type** : [Qualité #1 seuil-VMA / Qualité #2 tempo-marathon / Récupération (easy ou natation) / Sortie longue / Repos]
- **Format** : [ex. 5x1000m seuil, 15min allure marathon continu, 8km easy]
- **Allure/FC cible** : [zone précise, tirée des allures de référence ci-dessus]
- **Raison** : [enchaînement habituel Qualité #1 → Qualité #2 → Récupération → Sortie longue → Repos, séances déjà faites vs le plan cette semaine, état de récupération]
- **Alternative si fatigue** : [uniquement si un signal de fatigue est détecté ci-dessous]

Important : la séance recommandée (Type/Format/Allure-FC cible) doit être choisie parmi celles définies dans "Séances prévues cette semaine" ci-dessous (Qualité #1, Qualité #2, Récupération, Sortie longue), avec leur format et leurs allures/FC exacts tels que donnés dans le plan — n'invente pas un format différent. Base le choix sur les signaux de récupération disponibles (FC repos et HRV de la nuit, Body Battery, équilibre de charge Garmin aérobie/anaérobie) en plus de l'enchaînement habituel et de ce qui a déjà été fait cette semaine. Si un signal de fatigue se dégage (FC repos ou HRV anormale, Body Battery faible, charge aérobie faible insuffisante ou anaérobie excessive), recommande la séance Récupération ou le repos du plan plutôt qu'une séance de qualité même si l'enchaînement l'aurait voulu, et explique pourquoi dans "Raison" — mais reste toujours parmi les séances du plan, ne propose jamais un format hors plan. Si la recommandation est la séance Récupération, précise explicitement que la natation est une option valable au même titre qu'un footing facile.`;

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
        return `- Semaine ${w.week} (${w.focus || '—'}) : ${w.actualKm} km réalisés vs ${w.plannedKm ?? '?'} km prévus (${ecart}), ${w.shortSessionsCount}/${w.plannedSessionsPerWeek} séances courtes (Qualité #1, Qualité #2, Récupération), sortie longue ${w.longRunCompleted ? 'faite' : 'non faite'}`;
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

Si les statistiques hebdo indiquent que la semaine est encore en cours (pas terminée), ne dresse pas un bilan définitif comme si la semaine était close : identifie parmi les séances prévues cette semaine (Qualité #1, Qualité #2, Récupération, Sortie longue, listées ci-dessous) celles qui manquent encore, et propose concrètement de les caser d'ici dimanche plutôt que de les présenter comme un échec.

Style : reste factuel et concis, pas littéraire. Chaque section est une liste à puces courtes (1 ligne par idée), jamais un paragraphe narratif — pas de phrase d'intro/transition, pas de tournures du type "il est intéressant de noter que", pas de superlatifs, pas de reformulation en prose d'un chiffre qui vient d'être donné. Pour la description des activités individuelles en particulier, une ligne courte par séance — chiffres + verdict en quelques mots. Exemple de niveau de détail attendu : "11/08 : 8,64km — 1,6km éch. facile + 5,3km tempo à 4:41 (FC174, conforme) + 1,7km retour au calme". Sections 2 à 4 : maximum 2-3 puces courtes chacune, pas de paragraphe explicatif. Objectif : un rapport lisible en 30 secondes.

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
