const { GarminConnect } = require('garmin-connect');

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
}

module.exports = GarminClient;
