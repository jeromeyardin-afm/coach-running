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
}

module.exports = GarminClient;
