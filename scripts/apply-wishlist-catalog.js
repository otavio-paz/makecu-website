const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const catalogPath = path.join(projectRoot, "db", "checkout-catalog.json");
const sourcesPath = path.join(__dirname, "checkout-component-sources.json");
const downloadManifestPath = path.join(projectRoot, "images", "checkout", "components", "download-manifest.json");
const pendingImage = "/images/checkout-image-pending.svg";

function component(definition) {
  return Object.assign({
    description: "",
    imageUrl: pendingImage,
    imageAlt: `Photo pending review for ${definition.name}`,
    category: "Electronics",
    compatibility: "Arduino + Raspberry Pi",
    arduinoGuidance: "",
    raspberryPiGuidance: "",
    binLocation: "",
    technicalSpecs: "",
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 2,
    active: true
  }, definition);
}

const WISHLIST_UPDATES = [
  {
    existingName: "ESP (Wifi + Bluetooth) with Camera",
    name: "ESP32-CAM Development Board with USB Programmer",
    addedQuantity: 16,
    finalQuantity: 28,
    description: "ESP32-CAM development board with an OV2640 2 MP camera, Wi-Fi, Bluetooth, and an ESP32-CAM-MB USB programmer. Use it as a self-contained wireless camera or embedded vision controller.",
    category: "Camera",
    compatibility: "Arduino + Raspberry Pi",
    technicalSpecs: "Two-board set: ESP32-CAM with OV2640 2 MP camera plus ESP32-CAM-MB CH340G Micro-USB programmer; 2.4 GHz Wi-Fi and Bluetooth/BLE.",
    maxActivePerTeam: 3,
    sourceRow: 4,
    productUrl: "https://www.amazon.com/dp/B0FQP9Y114",
    note: "Wishlist row 4 adds eight two-piece ESP32-CAM sets (16 checkout units) to the existing 12 units."
  },
  {
    existingName: "Heart Rate Sensor",
    name: "MAX30102 Pulse Oximeter (Heart Rate + SpO₂)",
    addedQuantity: 7,
    finalQuantity: 13,
    description: "MAX30102 optical sensor module for prototype heart-rate and blood-oxygen saturation measurements over I2C. Maintain good skin contact and treat readings as experimental, not medical data.",
    category: "Sensor",
    compatibility: "Arduino + Raspberry Pi",
    technicalSpecs: "MAX30102 reflective photoplethysmography sensor; red and infrared LEDs; I2C interface; measures pulse waveform and supports estimated SpO₂ calculations.",
    maxActivePerTeam: 2,
    sourceRow: 26,
    productUrl: "https://www.amazon.com/dp/B0FND6SJ3K",
    note: "Wishlist rows 26 and 32 add three single modules and two two-packs (seven checkout units) to the existing six MAX30102 modules."
  }
];

const WISHLIST_COMPONENTS = [
  component({
    name: "INMP441 I2S MEMS Microphone",
    description: "Digital omnidirectional MEMS microphone module with an I2S output for voice, audio classification, and sound-level projects without an external ADC.",
    category: "Audio",
    compatibility: "Arduino + Raspberry Pi",
    technicalSpecs: "INMP441 digital MEMS microphone; I2S output; five modules per linked package.",
    totalQuantity: 10,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 3. Two packages of five modules. Listed package cost: $9.99. Priority: Medium.",
    sourceRow: 3,
    productUrl: "https://www.amazon.com/dp/B0GYDQC6WL"
  }),
  component({
    name: "MLX90640 Thermal Camera (32×24)",
    description: "Low-resolution infrared thermal camera array for heat maps, occupancy sensing, hot-spot detection, and contactless temperature experiments.",
    category: "Camera",
    compatibility: "Arduino + Raspberry Pi",
    technicalSpecs: "MLX90640 32×24-pixel long-wave infrared array; I2C interface.",
    totalQuantity: 2,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 5. Two single camera modules. Listed unit cost: $68.99. Priority: Medium.",
    sourceRow: 5,
    productUrl: "https://www.amazon.com/dp/B07ZKK8QWY"
  }),
  component({
    name: "Slamtec RPLIDAR A1 360° Scanner",
    description: "Motorized 360-degree two-dimensional laser scanner for indoor mapping, localization, navigation, and obstacle detection.",
    category: "Distance",
    compatibility: "Arduino + Raspberry Pi",
    arduinoGuidance: "Use a controller with sufficient serial throughput and memory, or stream measurements through a companion computer.",
    raspberryPiGuidance: "Connect through USB and use the Slamtec SDK or a supported ROS driver; keep the spinning assembly clear.",
    technicalSpecs: "RPLIDAR A1; 360° planar scan; USB interface; rotating laser ranging module.",
    totalQuantity: 1,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 6. One scanner. Listed unit cost: $99.00. Priority: Low.",
    sourceRow: 6,
    productUrl: "https://www.amazon.com/dp/B07TJW5SXF"
  }),
  component({
    name: "ADS1115 16-bit ADC Breakout",
    description: "Four-channel 16-bit analog-to-digital converter with a programmable gain amplifier for reading analog sensors from Arduino, ESP32, or Raspberry Pi projects.",
    technicalSpecs: "ADS1115; four single-ended or two differential inputs; I2C; up to 860 samples/s; three boards per linked package.",
    totalQuantity: 15,
    maxActivePerTeam: 3,
    adminNotes: "Wishlist row 7. Five packages of three boards (15 checkout units). Listed package cost: $12.99. Priority: Essential.",
    sourceRow: 7,
    productUrl: "https://www.amazon.com/dp/B0F1D3KGG2"
  }),
  component({
    name: "WS2812B Addressable RGB LED Strip (5 m)",
    description: "Five-meter strip with 300 individually addressable RGB pixels for lighting effects, status displays, and interactive installations. The strip requires a separate regulated 5 V supply sized for the intended brightness.",
    technicalSpecs: "WS2812B/5050 RGB; 60 pixels per meter; 300 pixels total; 5 V; non-waterproof black PCB; one five-meter strip per package.",
    totalQuantity: 8,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 8. Eight five-meter strips. Listed unit cost: $13.99. Priority: High.",
    sourceRow: 8,
    productUrl: "https://www.amazon.com/dp/B097BWJGYK"
  }),
  component({
    name: "WS2812B NeoPixel Ring (24 pixels)",
    description: "Circular board with 24 individually addressable RGB LEDs for indicators, wearables, clocks, and animated lighting effects.",
    technicalSpecs: "24 WS2812B RGB pixels per ring; 5 V data/power; five rings per linked package.",
    totalQuantity: 10,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 9. Two packages of five rings (10 checkout units). Listed package cost: $23.99. Priority: High.",
    sourceRow: 9,
    productUrl: "https://www.amazon.com/dp/B0B2D7742J"
  }),
  component({
    name: "SSD1306 0.96-inch OLED Display",
    description: "Compact monochrome OLED module for menus, sensor readouts, and status information. It is self-luminous and communicates over I2C.",
    technicalSpecs: "0.96-inch 128×64 OLED; SSD1306 controller; I2C; white pixels; five displays per linked package.",
    totalQuantity: 15,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 10. Three packages of five displays (15 checkout units). Listed package cost: $14.99. Priority: High.",
    sourceRow: 10,
    productUrl: "https://www.amazon.com/dp/B09T6SJBV5"
  }),
  component({
    name: "4-channel Bidirectional Logic Level Shifter",
    description: "Four-channel bidirectional level converter for translating I2C and other logic signals between 3.3 V and 5 V devices.",
    technicalSpecs: "Four bidirectional channels; 3.3 V/5 V logic conversion; ten boards per linked package.",
    totalQuantity: 20,
    maxActivePerTeam: 4,
    adminNotes: "Wishlist row 11. Two packages of ten boards (20 checkout units). Listed package cost: $7.49. Priority: High.",
    sourceRow: 11,
    productUrl: "https://www.amazon.com/dp/B07F7W91LC"
  }),
  component({
    name: "2.9-inch E-Paper Display Module",
    description: "Low-power monochrome e-paper module that retains an image without continuous power, suitable for badges, labels, and slow-refresh dashboards.",
    technicalSpecs: "2.9-inch e-paper display module; 296×128 resolution; SPI interface.",
    totalQuantity: 3,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 12. Three modules. Listed unit cost: $27.99. Priority: Medium.",
    sourceRow: 12,
    productUrl: "https://www.amazon.com/dp/B07P6MJPTD"
  }),
  component({
    name: "Arduino GIGA Display Shield",
    description: "Touch-enabled color display shield designed for the Arduino GIGA R1 WiFi, with onboard connectors and controls for embedded user interfaces.",
    compatibility: "Arduino",
    technicalSpecs: "Arduino ASX00039 GIGA Display Shield; 3.97-inch 480×800 RGB touch display; designed for Arduino GIGA R1 WiFi.",
    totalQuantity: 2,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 13. Two shields. Listed unit cost: $63.60. Priority: Medium.",
    sourceRow: 13,
    productUrl: "https://www.amazon.com/dp/B0CKBZLTND"
  }),
  component({
    name: "7-inch Raspberry Pi Capacitive Touch Display",
    description: "HDMI touch display for Raspberry Pi dashboards, kiosks, and graphical interfaces. It uses HDMI for video and USB for capacitive touch input.",
    compatibility: "Raspberry Pi",
    technicalSpecs: "7-inch 1024×600 IPS display; capacitive touch; HDMI video; USB touch interface.",
    totalQuantity: 2,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 14. Two displays. Listed unit cost: $45.99. Priority: Medium.",
    sourceRow: 14,
    productUrl: "https://www.amazon.com/dp/B09XKC53NH"
  }),
  component({
    name: "ESP32 ESP-WROOM-32 Development Board",
    description: "General-purpose Wi-Fi and Bluetooth microcontroller development board with USB programming, GPIO, ADC, DAC, PWM, SPI, UART, and I2C support.",
    category: "Microcontroller",
    technicalSpecs: "ESP-WROOM-32 module; CP2102 USB-to-serial bridge; Micro-USB; dual-core 2.4 GHz Wi-Fi/Bluetooth MCU; three boards per linked package.",
    totalQuantity: 30,
    maxActivePerTeam: 3,
    adminNotes: "Wishlist row 15. Ten packages of three boards (30 checkout units). Listed package cost: $14.39. Priority: Essential.",
    sourceRow: 15,
    productUrl: "https://www.amazon.com/dp/B0C7C2HQ7P"
  }),
  component({
    name: "TB6612FNG Dual Motor Driver",
    description: "Compact dual H-bridge driver for controlling two brushed DC motors or one bipolar stepper with higher efficiency than an L298N module.",
    category: "Motor Related",
    technicalSpecs: "TB6612FNG dual H-bridge; logic-level direction and PWM control; four boards per linked package.",
    totalQuantity: 16,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 16. Four packages of four boards (16 checkout units). Listed package cost: $9.99. Priority: High.",
    sourceRow: 16,
    productUrl: "https://www.amazon.com/dp/B0F43L7LLD"
  }),
  component({
    name: "Micro-HDMI to HDMI Cable",
    description: "Video cable for connecting a Raspberry Pi 4 or 5 micro-HDMI output to a full-size HDMI monitor or capture device.",
    category: "Pi-related",
    compatibility: "Raspberry Pi",
    technicalSpecs: "Micro-HDMI male to HDMI male cable with Ethernet support.",
    totalQuantity: 2,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 17. Two cables. Listed unit cost: $6.56. Priority: Essential.",
    sourceRow: 17,
    productUrl: "https://www.amazon.com/dp/B07KSDB25X"
  }),
  component({
    name: "USB Keyboard and Mouse Combo",
    description: "Full-size USB keyboard and optical mouse set for Raspberry Pi desktop setup, terminal access, and local debugging.",
    category: "Pi-related",
    compatibility: "Raspberry Pi",
    technicalSpecs: "Wired full-size USB keyboard plus wired USB optical mouse.",
    totalQuantity: 1,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 18. One keyboard-and-mouse set. Listed set cost: $15.00. Priority: Essential.",
    sourceRow: 18,
    productUrl: "https://www.amazon.com/dp/B003NR874S"
  }),
  component({
    name: "Raspberry Pi 5 USB-C Power Supply (27 W)",
    description: "5 V/5 A USB-C power adapter sized for Raspberry Pi 5 boards and attached USB, camera, and wireless peripherals.",
    category: "Power",
    compatibility: "Raspberry Pi",
    technicalSpecs: "USB-C Power Delivery supply; 27 W maximum; 5 V/5 A Raspberry Pi 5 output profile.",
    totalQuantity: 12,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 19. Twelve power supplies. Listed unit cost: $11.29. Priority: Essential.",
    sourceRow: 19,
    productUrl: "https://www.amazon.com/dp/B0FHH9K47T"
  }),
  component({
    name: "LD2410C mmWave Presence Radar",
    description: "24 GHz radar module that detects motion, still presence, and small movements for occupancy and interactive-environment projects.",
    category: "Sensor",
    technicalSpecs: "HLK-LD2410C-compatible 24 GHz FMCW radar; UART and GPIO outputs; up to approximately 5 m presence range.",
    totalQuantity: 2,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 20. Two modules. Listed unit cost: $20.48. Priority: High.",
    sourceRow: 20,
    productUrl: "https://www.amazon.com/dp/B0F1F97422"
  }),
  component({
    name: "SCD41 NDIR CO₂ Sensor",
    description: "Photoacoustic NDIR carbon-dioxide sensor module with integrated temperature and humidity compensation for indoor air-quality monitoring.",
    category: "Sensor",
    technicalSpecs: "SCD41 CO₂ sensor; I2C; nominal 400–5000 ppm range; 2.4–5.5 V module supply.",
    totalQuantity: 4,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 21. Four modules. Listed unit cost: $26.99. Priority: Medium.",
    sourceRow: 21,
    productUrl: "https://www.amazon.com/dp/B0F6MRMNLH"
  }),
  component({
    name: "BME680 Environmental Sensor",
    description: "Four-in-one environmental sensor module for temperature, humidity, barometric pressure, and volatile-organic-compound measurements.",
    category: "Sensor",
    technicalSpecs: "BME680; temperature, relative humidity, pressure, and gas resistance; I2C/SPI; two modules per linked package.",
    totalQuantity: 6,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 22. Three packages of two modules (six checkout units). Listed package cost: $21.88. Priority: Medium.",
    sourceRow: 22,
    productUrl: "https://www.amazon.com/dp/B0FQJFK4CL"
  }),
  component({
    name: "VL53L5CX Multizone Time-of-Flight Sensor",
    description: "Multizone laser ranging module for gesture sensing, presence detection, depth maps, and short-range obstacle measurements.",
    category: "Sensor",
    technicalSpecs: "VL53L5CX/VL53L5X V2; multizone ToF ranging; up to 8×8 zones when supported; I2C; two modules per linked package.",
    totalQuantity: 4,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 23. Two packages of two modules (four checkout units). Listed package cost: $25.99. Priority: Medium.",
    sourceRow: 23,
    productUrl: "https://www.amazon.com/dp/B0GSF96HHH"
  }),
  component({
    name: "PMS5003 Particulate Matter Sensor",
    description: "Laser-scattering air-quality sensor for measuring airborne PM1.0, PM2.5, and PM10 particle concentrations.",
    category: "Sensor",
    technicalSpecs: "PMS5003 laser particulate sensor with 8-pin cable; 5 V power; serial digital output.",
    totalQuantity: 3,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 24. Three sensors. Listed unit cost: $22.99. Priority: Medium.",
    sourceRow: 24,
    productUrl: "https://www.amazon.com/dp/B0BG62Z8L3"
  }),
  component({
    name: "INA219 Current and Power Monitor",
    description: "Bidirectional high-side current, bus-voltage, and power monitor module for energy measurements and power debugging over I2C.",
    category: "Sensor",
    technicalSpecs: "INA219; I2C; monitors up to 26 V bus voltage; onboard shunt resistor; one module per linked package.",
    totalQuantity: 8,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 25. Eight modules. Listed unit cost: $6.99. Priority: Medium.",
    sourceRow: 25,
    productUrl: "https://www.amazon.com/dp/B01ICN5OAM"
  }),
  component({
    name: "AS7341 11-channel Spectral Sensor",
    description: "Multichannel visible and near-infrared light sensor for color measurement, material comparison, and simple spectrometry experiments.",
    category: "Sensor",
    technicalSpecs: "AS7341 spectral sensor; 11 sensing channels including visible, clear, NIR, and flicker detection; I2C.",
    totalQuantity: 3,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 27. Three modules. Listed unit cost: $19.99. Priority: Medium.",
    sourceRow: 27,
    productUrl: "https://www.amazon.com/dp/B0DBQKDV67"
  }),
  component({
    name: "LTR390 UV and Ambient Light Sensor",
    description: "Digital sensor for ultraviolet-A intensity and ambient visible-light measurements, useful for UV-index and illuminance projects.",
    category: "Sensor",
    technicalSpecs: "LTR390; UVA and ambient-light modes; I2C digital output.",
    totalQuantity: 2,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 28. Two modules. Listed unit cost: $14.60. Priority: Medium.",
    sourceRow: 28,
    productUrl: "https://www.amazon.com/dp/B09FDGTKLX"
  }),
  component({
    name: "TMC2209 V1.3 Stepper Motor Driver",
    description: "Quiet microstepping driver module for bipolar stepper motors, with configurable current limiting and UART control.",
    category: "Motor Related",
    technicalSpecs: "TMC2209 V1.3 stepper driver carrier; Step/Dir and UART control; six drivers per linked package.",
    totalQuantity: 6,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 29. One package of six drivers. Listed package cost: $29.99. Priority: Essential.",
    sourceRow: 29,
    productUrl: "https://www.amazon.com/dp/B08WZFK9KT"
  }),
  component({
    name: "Raspberry Pi AI Camera (Sony IMX500)",
    description: "Raspberry Pi camera module with Sony's IMX500 intelligent vision sensor for running supported neural-network inference directly on the camera.",
    category: "Camera",
    compatibility: "Raspberry Pi",
    technicalSpecs: "Sony IMX500 intelligent vision sensor; 12.3 MP; integrated inference accelerator; Raspberry Pi CSI camera interface.",
    totalQuantity: 1,
    maxActivePerTeam: 1,
    adminNotes: "Wishlist row 30. One camera. Listed unit cost: $77.00.",
    sourceRow: 30,
    productUrl: "https://www.adafruit.com/product/6009"
  }),
  component({
    name: "Analog Pulse Sensor",
    description: "Optical analog pulse-wave sensor for introductory heart-rate experiments. It requires an analog input and careful placement; it is not a medical device.",
    category: "Sensor",
    compatibility: "Arduino",
    raspberryPiGuidance: "Use an external ADC such as the ADS1115 because Raspberry Pi boards do not provide analog inputs.",
    technicalSpecs: "Analog photoplethysmography pulse sensor module; three sensors per linked package.",
    totalQuantity: 6,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 31. Two packages of three sensors (six checkout units). Listed package cost: $16.99. Kept separate from MAX30102 digital pulse-oximeter modules.",
    sourceRow: 31,
    productUrl: "https://www.amazon.com/dp/B09PR3QQVD"
  }),
  component({
    name: "Flex Sensor (2.2-inch)",
    description: "Bend-sensitive variable resistor for wearable controls, gesture gloves, and joint-angle prototypes. Use it in a voltage divider and avoid sharp folds.",
    category: "Sensor",
    technicalSpecs: "2.2-inch resistive flex/bend sensor; resistance increases as the strip bends.",
    totalQuantity: 8,
    maxActivePerTeam: 2,
    adminNotes: "Wishlist row 33. Eight sensors. Listed unit cost: $10.59. Priority: Medium. The linked Amazon page returned 404 during image retrieval, so the local preview uses the equivalent SparkFun SEN-10264 product photo.",
    sourceRow: 33,
    productUrl: "https://www.sparkfun.com/flex-sensor-2-2.html"
  })
];

function updateSources(sourceManifest) {
  const aliases = new Map(WISHLIST_UPDATES.map((item) => [item.existingName, item]));
  sourceManifest.items = sourceManifest.items.map(function (item) {
    const update = aliases.get(item.name);
    if (!update) return item;
    return Object.assign({}, item, {
      name: update.name,
      sourceRow: update.sourceRow,
      sourceSheet: "Wishlist",
      productUrl: update.productUrl
    });
  });

  const byName = new Map(sourceManifest.items.map((item) => [item.name, item]));
  for (const item of WISHLIST_COMPONENTS) {
    byName.set(item.name, {
      name: item.name,
      sourceRow: item.sourceRow,
      sourceSheet: "Wishlist",
      productUrl: item.productUrl
    });
  }
  sourceManifest.items = [...byName.values()];
  sourceManifest.sheet = "Full Inventory Check 10-4-26 and Wishlist";
  return sourceManifest;
}

function imageFields(name, imageByName) {
  const imageUrl = imageByName && imageByName.get(name);
  if (!imageUrl) return {};
  return {
    imageUrl,
    imageAlt: `Product photo of ${name} from the linked supplier page`
  };
}

function updateCatalog(catalog, imageByName) {
  const byName = new Map(catalog.components.map((item) => [item.name, item]));

  for (const definition of WISHLIST_UPDATES) {
    const existing = byName.get(definition.existingName) || byName.get(definition.name);
    if (!existing) throw new Error(`Missing catalog component to update: ${definition.existingName}`);
    if (![definition.finalQuantity, definition.finalQuantity - definition.addedQuantity].includes(existing.totalQuantity)) {
      throw new Error(`${existing.name} has unexpected quantity ${existing.totalQuantity}; expected ${definition.finalQuantity - definition.addedQuantity} or ${definition.finalQuantity}.`);
    }
    byName.delete(existing.name);
    byName.set(definition.name, Object.assign({}, existing, {
      name: definition.name,
      description: definition.description,
      imageUrl: pendingImage,
      imageAlt: `Photo pending review for ${definition.name}`,
      category: definition.category,
      compatibility: definition.compatibility,
      technicalSpecs: definition.technicalSpecs,
      totalQuantity: definition.finalQuantity,
      maxActivePerTeam: definition.maxActivePerTeam,
      adminNotes: existing.adminNotes.includes(definition.note) ? existing.adminNotes : `${existing.adminNotes} ${definition.note}`
    }, imageFields(definition.name, imageByName)));
  }

  for (const item of WISHLIST_COMPONENTS) {
    const stored = Object.assign({}, item);
    delete stored.sourceRow;
    delete stored.productUrl;
    const existing = byName.get(stored.name);
    byName.set(stored.name, Object.assign({}, existing || {}, stored, imageFields(stored.name, imageByName)));
  }

  catalog.components = [...byName.values()].sort((left, right) =>
    left.category.localeCompare(right.category) || left.name.localeCompare(right.name)
  );
  catalog.source = "Finalized MakeCU 2026 checkout catalog with Wishlist additions";
  return catalog;
}

function main() {
  const downloadManifest = JSON.parse(fs.readFileSync(downloadManifestPath, "utf8"));
  const imageByName = new Map(downloadManifest.items
    .filter((item) => item.status === "downloaded" && item.localImage)
    .map((item) => [item.name, item.localImage]));
  const catalog = updateCatalog(JSON.parse(fs.readFileSync(catalogPath, "utf8")), imageByName);
  const sources = updateSources(JSON.parse(fs.readFileSync(sourcesPath, "utf8")));
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  fs.writeFileSync(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
  process.stdout.write(`Catalog now contains ${catalog.components.length} components; source manifest contains ${sources.items.length} links.\n`);
}

if (require.main === module) main();

module.exports = { WISHLIST_COMPONENTS, WISHLIST_UPDATES, updateCatalog, updateSources };
