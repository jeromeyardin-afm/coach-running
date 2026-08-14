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

// includeMonthlyBalance=false pour le rapport quotidien : l'équilibre de
// charge Garmin porte sur une fenêtre glissante de 4 semaines, peu
// pertinente pour juger une seule séance — seuls le statut et la charge
// aiguë/chronique (ratio 7j/28j, pertinent au jour le jour) restent.
function formatTrainingStatusBlock(status, { includeMonthlyBalance = true } = {}) {
  if (!status) return '';
  const parts = [];
  if (status.vo2Max != null) parts.push(`VO2max mesuré : ${status.vo2Max}`);
  if (status.statusLabel) parts.push(`Statut d'entraînement Garmin : ${status.statusLabel}`);
  if (status.acuteLoad != null && status.chronicLoad != null) {
    parts.push(`Charge aiguë/chronique : ${status.acuteLoad}/${status.chronicLoad} (ratio ${status.loadRatio ?? 'n/a'}, statut ${status.loadStatus || 'n/a'})`);
  }
  if (includeMonthlyBalance) {
    const balanceLines = [];
    if (status.aerobicLow) balanceLines.push(`aérobie faible ${status.aerobicLow.value} (cible ${status.aerobicLow.min}-${status.aerobicLow.max}) → ${status.aerobicLow.verdict}`);
    if (status.aerobicHigh) balanceLines.push(`aérobie élevée ${status.aerobicHigh.value} (cible ${status.aerobicHigh.min}-${status.aerobicHigh.max}) → ${status.aerobicHigh.verdict}`);
    if (status.anaerobic) balanceLines.push(`anaérobie ${status.anaerobic.value} (cible ${status.anaerobic.min}-${status.anaerobic.max}) → ${status.anaerobic.verdict}`);
    if (balanceLines.length > 0) parts.push(`Équilibre de charge mensuel (Garmin) : ${balanceLines.join(', ')}`);
  }

  if (parts.length === 0) return '';
  return `\nStatut d'entraînement Garmin (instantané au moment du rapport) :\n${parts.map((p) => `- ${p}`).join('\n')}\n`;
}

function formatWeekZoneDistributionBlock(zoneDistribution) {
  if (!zoneDistribution || zoneDistribution.length === 0) return '';
  const lines = zoneDistribution.map((z) => `${z.zone} ${z.km}km (${z.percent}%)`).join(', ');
  return `\nRépartition de la semaine en cours par zone (jusqu'à cette séance incluse) : ${lines}.\n`;
}

function formatWeekSessionsBlock(weekSessions) {
  if (!weekSessions || weekSessions.length === 0) return '';
  const lines = weekSessions.map((s) => `- ${s.dateFr} : ${s.label}`).join('\n');
  return `\nSéances déjà réalisées cette semaine, dans l'ordre chronologique (jusqu'à cette séance incluse) :\n${lines}\n`;
}

function formatWeekVolumeBlock(weekVolume) {
  if (!weekVolume || weekVolume.plannedKm == null) return '';
  const percent = Math.round((weekVolume.actualKm / weekVolume.plannedKm) * 100);
  return `\nVolume de la semaine en cours (jusqu'à cette séance incluse) : ${weekVolume.actualKm} km réalisés sur ${weekVolume.plannedKm} km visés (${percent}%).\n`;
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

function formatRacePredictionsBlock(racePredictions) {
  if (!racePredictions) return '';
  const parts = [];
  if (racePredictions.time5K) parts.push(`5K ${racePredictions.time5K.duration} (${racePredictions.time5K.pace}/km)`);
  if (racePredictions.time10K) parts.push(`10K ${racePredictions.time10K.duration} (${racePredictions.time10K.pace}/km)`);
  if (racePredictions.timeHalfMarathon) parts.push(`semi ${racePredictions.timeHalfMarathon.duration} (${racePredictions.timeHalfMarathon.pace}/km)`);
  if (racePredictions.timeMarathon) parts.push(`marathon ${racePredictions.timeMarathon.duration} (${racePredictions.timeMarathon.pace}/km)`);
  if (parts.length === 0) return '';
  return `\nPrédicteur de course Garmin (basé sur le VO2max et la forme actuelle, méthode générique — à distinguer du potentiel basé sur le record semi réel) : ${parts.join(', ')}.\n`;
}

class CoachMarathon {
  async analyzeActivity(activity, sleep = null, splits = null, trainingStatus = null, dynamics = null, weekZoneDistribution = null, weekSessions = null, weekVolume = null) {
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
${formatTrainingStatusBlock(trainingStatus, { includeMonthlyBalance: false })}
${formatWeekZoneDistributionBlock(weekZoneDistribution)}
${formatWeekSessionsBlock(weekSessions)}
${formatWeekVolumeBlock(weekVolume)}

${buildPlanContext()}

Important : pour juger de l'intensité de cette séance, base-toi uniquement sur la zone détectée ci-dessus (dérivée des zones FC personnalisées de cet athlète), jamais sur un pourcentage brut de FC max théorique — un effort peut représenter 70-75% de la FC max tout en étant parfaitement dans la zone de récupération pour cet athlète spécifique. Si un détail par segment est fourni, analyse chaque segment séparément (ex. échauffement facile puis portion à allure qualité) plutôt que de juger la séance sur sa seule moyenne globale, qui peut masquer une structure délibérée. Sur un segment très court (moins d'environ 90 secondes, comme un sprint de 20-30s), la FC n'a pas le temps de monter et sous-estime l'intensité réelle — fie-toi à l'allure du segment plutôt qu'à sa FC pour juger ce type d'effort. Si la répartition de la semaine en cours montre déjà une part de facile/endurance faible par rapport à ce qui est attendu à ce stade de la semaine, priorise des conseils qui favorisent le volume facile plutôt que d'ajouter de l'intensité — ne parle pas d'un équilibre "mensuel", cette donnée est volontairement à l'échelle de la semaine ici, pas du mois (le mensuel reste dans le bilan hebdo).

Style : pour le constat sur la séance (points 1-2), reste factuel et concis — une ligne courte par idée, chiffres + verdict, pas de tournures du type "il est intéressant de noter que" ou "on observe que", pas de réintroduction en prose d'un chiffre déjà donné ci-dessus. En revanche, dans "Prochaine séance recommandée", développe un peu plus les champs "Raison" et "Alternative si fatigue" (2-3 phrases) : explique le pourquoi (enchaînement, récupération, état de forme), pas juste l'énoncé sec — c'est le conseil que Jérôme doit comprendre et pouvoir appliquer, pas une liste de mots-clés.

Donne un feedback court et actionnable, points 1-3 en 1-2 phrases courtes maximum :
1. Cette séance a-t-elle apporté de la valeur d'entraînement (volume facile, récupération, travail de capacité...) et s'insère-t-elle logiquement dans la semaine ? Utilise la zone détectée — ou le détail par segment si disponible — pour éclairer cette analyse, pas pour pointer un écart de format comme une alerte en soi
2. Signaux positifs ou alertes à surveiller (uniquement des signaux physiologiques ou d'entraînement réels — fatigue, dérive de FC, charge déséquilibrée — pas un simple écart au format nommé)
3. Hydratation/nutrition si besoin

Termine ensuite par cette section, sous ce format exact :

## Prochaine séance recommandée
- **Quand** : [demain / surlendemain / selon ressenti]
- **Type** : [Qualité #1 seuil-VMA / Qualité #2 tempo-marathon / Récupération (easy ou natation) / Sortie longue / Repos]
- **Format** : [ex. 5x1000m seuil, 15min allure marathon continu, 8km easy]
- **Allure/FC cible** : [zone précise, tirée des allures de référence ci-dessus]
- **Raison** : [2-3 phrases qui expliquent le choix — enchaînement habituel Qualité #1 → Qualité #2 → Récupération → Sortie longue → Repos, séances déjà faites vs le plan cette semaine, état de récupération]
- **Alternative si fatigue** : [uniquement si un signal de fatigue est détecté ci-dessous]

Important : la séance recommandée (Type/Format/Allure-FC cible) doit être choisie parmi celles définies dans "Séances prévues cette semaine" ci-dessous (Qualité #1, Qualité #2, Récupération, Sortie longue), avec leur format et leurs allures/FC exacts tels que donnés dans le plan — n'invente pas un format différent. Utilise la liste "Séances déjà réalisées cette semaine" pour déterminer objectivement ce qui reste à caser d'ici dimanche, plutôt que de le déduire ou de le supposer à partir du seul narratif de la séance du jour — ne recommande pas un type de séance déjà couvert cette semaine (ex. une deuxième Qualité #1) sauf si le nombre de séances réalisées est inférieur à ${plan.trainingPlan.sessionsPerWeek} et qu'aucun format prévu ne correspond mieux à ce qui manque. Vérifie aussi le volume hebdomadaire réalisé vs visé donné ci-dessous : si le volume visé est déjà atteint ou dépassé, le volume total prime sur la case "type de séance manquant" — recommande Repos plutôt que d'ajouter une séance (même un type du plan pas encore fait) juste pour cocher toutes les cases, surtout en semaine de récupération/cutback ; n'ajoute quand même une séance manquante que si elle est structurellement indispensable (ex. la seule sortie longue de la semaine, pour la routine d'endurance) ET que le dépassement de volume qu'elle entraînerait reste marginal (grossièrement <10%) ET que les signaux de récupération sont excellents. Base le choix sur les signaux de récupération disponibles (FC repos et HRV de la nuit, Body Battery, équilibre de charge Garmin aérobie/anaérobie) en plus de l'enchaînement habituel et de ce qui a déjà été fait cette semaine. Si un signal de fatigue se dégage (FC repos ou HRV anormale, Body Battery faible, charge aérobie faible insuffisante ou anaérobie excessive), recommande la séance Récupération ou le repos du plan plutôt qu'une séance de qualité même si l'enchaînement l'aurait voulu, et explique pourquoi dans "Raison" — mais reste toujours parmi les séances du plan, ne propose jamais un format hors plan. Si la recommandation est la séance Récupération, précise explicitement que la natation est une option valable au même titre qu'un footing facile.`;

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

  async generateWeeklyReport(activities, weeklyProgress = [], weight = null, trainingStatus = null, weeklyStats = null, racePredictions = null) {
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
${formatRacePredictionsBlock(racePredictions)}

${buildPlanContext()}

Important : pour juger de l'intensité de chaque séance, base-toi uniquement sur la zone indiquée à côté de chaque FC (dérivée des zones personnalisées de cet athlète), jamais sur un pourcentage brut de FC max théorique. Quand un détail [détail : ...] est présent à côté d'une activité, analyse cette séance segment par segment (ex. échauffement facile puis portion à allure qualité) plutôt que sur sa seule moyenne globale, qui peut masquer une structure délibérée et faire passer une séance conforme au plan pour une séance trop rapide ou trop soutenue. Sur un segment très court (moins d'environ 90 secondes, comme un sprint de 20-30s), la FC n'a pas le temps de monter et sous-estime l'intensité réelle — fie-toi à l'allure du segment plutôt qu'à sa FC pour juger ce type d'effort (c'est déjà ainsi que la répartition par zone affichée dans l'email est calculée, le commentaire doit rester cohérent avec elle). Si l'équilibre de charge Garmin signale un manque de charge aérobie faible ou un excès anaérobie, mentionne-le explicitement dans les points d'amélioration/ajustements — c'est un signal indépendant du simple respect du volume prévu, et il peut expliquer une fatigue même quand le volume hebdo semble correct.

Si les statistiques hebdo indiquent que la semaine est encore en cours (pas terminée), ne dresse pas un bilan définitif comme si la semaine était close : identifie parmi les séances prévues cette semaine (Qualité #1, Qualité #2, Récupération, Sortie longue, listées ci-dessous) celles qui manquent encore, et propose concrètement de les caser d'ici dimanche plutôt que de les présenter comme un échec.

Ne redis pas en chiffres ce que l'email affiche déjà visuellement : le volume de la semaine (barre), la répartition par zone de la semaine (barre + légende), la progression semaine par semaine — volume et zones pour chaque semaine du plan (section dédiée avec une carte par semaine), l'équilibre de charge Garmin (barres), et le prédicteur de course Garmin (cartes 5K/10K/semi/marathon, en fin d'email). Commente-les seulement quand il y a quelque chose à expliquer (pourquoi ce déséquilibre, ce que ça implique) — jamais pour répéter la valeur déjà visible. Si le prédicteur de course Garmin est présent, ne te contente pas de citer ses temps : explique dans la section 2 pourquoi sa prédiction marathon (basée sur le VO2max, une méthode générique) peut diverger de manière notable du potentiel basé sur le record semi réel (${plan.physiology.semiMarathonRecord.predictedMarathonPotential}) — le second est généralement plus fiable pour ce type d'écart.

Style : sections 1 et 2 (résumé, progression) restent factuelles et concises — liste à puces courtes, 1 ligne par idée, pas de paragraphe narratif, pas de phrase d'intro/transition, pas de tournures du type "il est intéressant de noter que", pas de superlatifs. Pour la description des activités individuelles, une ligne courte par séance — chiffres + verdict. Exemple de niveau de détail attendu : "11/08 : 8,64km — 1,6km éch. facile + 5,3km tempo à 4:41 (FC174, conforme) + 1,7km retour au calme". Sections 3, 4 et 5 (points d'amélioration, ajustements, proposition d'ajustement du plan) peuvent en revanche développer davantage : 2-3 phrases pour expliquer le pourquoi et le comment, pas juste l'énoncer sèchement — c'est le conseil concret que Jérôme doit pouvoir appliquer (ou approuver, pour la section 5).

Génère un rapport hebdo avec ces sections :
1. **Résumé de la semaine** : une ligne par activité (voir consigne de style ci-dessus, en insistant sur le détail par segment/dynamique quand disponible plutôt que sur le volume déjà visible ailleurs), séances de qualité faites vs prévues (compare aux allures cibles de la séance qualité prévue cette semaine), sortie longue (distance/allure/dénivelé), jours de repos
2. **Progression globale vers l'objectif** : commence par un commentaire général sur la semaine (1-2 phrases, comment elle s'est globalement déroulée par rapport au plan) avant d'interpréter la tendance chiffrée. La tendance semaine par semaine est déjà visible en barres plus bas dans l'email — interprète-la (en avance, dans les clous, ou en retard sur le plan ?) sans la redécrire chiffre par chiffre. Le potentiel marathon estimé (${plan.physiology.semiMarathonRecord.predictedMarathonPotential}) reste-t-il crédible au vu de l'exécution jusqu'ici ?
3. **Points d'amélioration** : 2-3 points concrets et priorisés (pas une liste exhaustive), chacun expliqué en quelques phrases
4. **Ajustements pour la semaine à venir** : explique le raisonnement, pas juste une liste d'actions
5. **Proposition d'ajustement du plan** : uniquement si une tendance sur au moins 2-3 semaines consécutives (pas un écart ponctuel) justifie de modifier le volume ou l'intensité des semaines à venir. Si oui, indique précisément quelle(s) semaine(s) ajuster et de combien (ex. "réduire le volume de la semaine 6 de 40 à 35 km" ou "augmenter la semaine 9 de 45 à 48 km"), avec la raison. La proposition doit être assez précise et chiffrée pour être appliquée telle quelle. Si rien ne justifie un ajustement structurel cette semaine, écris une seule ligne le disant plutôt que d'inventer une proposition.
6. Un mot d'encouragement (2-3 phrases)`;

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
