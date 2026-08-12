const { GarminConnect } = require('garmin-connect');
const { toGarminDateString } = require('./garminUtils');

class GarminClient {
  constructor(email, password) {
    this.client = new GarminConnect({ username: email, password });
    this.loggedIn = false;
  }

  async login() {
    if (this.loggedIn) return;
    await this.client.login();
    this.loggedIn = true;
  }

  async getActivities(limit = 10) {
    await this.login();
    return this.client.getActivities(0, limit);
  }

  async getSleepData(date) {
    await this.login();
    return this.client.getSleepData(date);
  }

  async getDailyWeightData(date) {
    await this.login();
    return this.client.getDailyWeightData(date);
  }

  // Endpoint interne non documenté par garmin-connect (pas de méthode
  // officielle pour les tours/segments) — la structure peut changer sans
  // préavis. this.client.client est le HttpClient authentifié exposé
  // publiquement par la lib pour ce genre de requête custom.
  async getActivitySplits(activityId) {
    await this.login();
    return this.client.client.get(
      `https://connectapi.garmin.com/activity-service/activity/${activityId}/splits`
    );
  }

  // Endpoints internes non documentés par garmin-connect (mêmes réserves que
  // getActivitySplits ci-dessus). Chemins repris de projets open-source de
  // reverse engineering de l'API Garmin (ex. python-garminconnect) — non
  // vérifiés contre une vraie réponse pour l'instant, d'où /api/debug-training-status
  // pour inspecter la forme réelle avant de s'appuyer dessus dans l'analyse.
  async getTrainingStatus(date = new Date()) {
    await this.login();
    const dateString = toGarminDateString(date);
    return this.client.get(
      `https://connectapi.garmin.com/metrics-service/metrics/trainingstatus/aggregated/${dateString}`
    );
  }

  async getMaxMetrics(date = new Date()) {
    await this.login();
    const dateString = toGarminDateString(date);
    return this.client.get(
      `https://connectapi.garmin.com/metrics-service/metrics/maxmet/daily/${dateString}/${dateString}`
    );
  }

  async getTrainingReadiness(date = new Date()) {
    await this.login();
    const dateString = toGarminDateString(date);
    return this.client.get(
      `https://connectapi.garmin.com/metrics-service/metrics/trainingreadiness/${dateString}`
    );
  }
}

module.exports = GarminClient;
