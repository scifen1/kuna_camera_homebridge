const axios = require('axios');
let Accessory, Service, Characteristic, UUIDGen;

module.exports = (homebridge) => {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform('homebridge-kuna', 'KunaPlatform', KunaPlatform, true);
};

class KunaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.email = config.email;
    this.password = config.password;
    this.api = api;
    this.accessories = [];

    if (api) {
      this.api.on('didFinishLaunching', this.discoverDevices.bind(this));
    }
  }

  // Authenticate and obtain the access token from Kuna API
  async authenticate() {
    try {
      const response = await axios.post('https://api.getkuna.com/oauth/token', {
        username: this.email,
        password: this.password,
        grant_type: 'password',
      });
      this.token = response.data.access_token;
      this.log('Successfully authenticated with Kuna API.');
    } catch (error) {
      this.log('Failed to authenticate with Kuna:', error);
    }
  }

  // Discover devices and register them as HomeKit accessories
  async discoverDevices() {
    await this.authenticate();

    try {
      const response = await axios.get('https://api.getkuna.com/v4/users/devices', {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      const devices = response.data.devices;

      devices.forEach((device) => {
        this.log(`Found device: ${device.name}`);
        const uuid = UUIDGen.generate(device.id.toString());

        let accessory = this.accessories.find(a => a.UUID === uuid);

        if (!accessory) {
          accessory = new Accessory(device.name, uuid);
          accessory.context.device = device;

          // Add motion sensor and light services
          accessory.addService(Service.MotionSensor, device.name);
          accessory.addService(Service.Lightbulb, `${device.name} Light`);

          this.api.registerPlatformAccessories('homebridge-kuna', 'KunaPlatform', [accessory]);
        }

        this.configureAccessory(accessory);
      });
    } catch (error) {
      this.log('Error discovering devices:', error);
    }
  }

  // Configure each accessory and its services (motion sensor and light)
  configureAccessory(accessory) {
    const device = accessory.context.device;

    accessory.getService(Service.MotionSensor)
      .getCharacteristic(Characteristic.MotionDetected)
      .on('get', async (callback) => {
        const motionDetected = await this.checkMotion(device.id);
        callback(null, motionDetected);
      });

    accessory.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .on('set', async (value, callback) => {
        await this.setLightState(device.id, value);
        callback();
      });
  }

  // Check if motion is detected on the camera
  async checkMotion(deviceId) {
    try {
      const response = await axios.get(`https://api.getkuna.com/v4/device/${deviceId}/motion`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return response.data.motion_detected;
    } catch (error) {
      this.log('Error checking motion:', error);
      return false;
    }
  }

  // Control the camera's light
  async setLightState(deviceId, state) {
    try {
      await axios.put(`https://api.getkuna.com/v4/device/${deviceId}/light`, {
        state: state ? 'on' : 'off'
      }, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      this.log(`Light ${state ? 'on' : 'off'}`);
    } catch (error) {
      this.log('Error setting light state:', error);
    }
  }
}
