const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");

const SERVO_NAMES = [
  "2000 Series Dual Mode servo", "9g Micro Servo", "D646WP servo", "FT5330M servo",
  "MG90S", "S3004 servo", "SF3218MG Servo", "SG90 Servo"
];

const GUIDANCE = [
  {
    names: SERVO_NAMES,
    arduino: "Standard servo PWM control is compatible. For multiple servos, use a servo driver and a separate supply matched to the servos; connect the grounds.",
    raspberryPi: "Use a servo driver for stable PWM. Do not power servos from the Raspberry Pi; use a separate supply matched to the servos and connect the grounds."
  },
  {
    names: ["DC Motors", "DC Gearbox", "TT Gearbox motor", "Type 130", "Vibration Motors", "550 Titan 12-Turn", "Dark motors with no name", "Motor with PCB soldered", "Pump"],
    arduino: "Requires a motor driver and external motor power. Never connect the motor directly to an Arduino GPIO pin; connect controller and driver grounds.",
    raspberryPi: "Requires a 3.3 V-compatible motor driver and external motor power. Never power or drive the motor directly from Raspberry Pi GPIO."
  },
  {
    names: ["28BYJ-48 stepper", "Grover Stepper Motor", "Nema 17"],
    arduino: "Requires a stepper driver matched to the motor wiring and current. Use external motor power and connect the driver ground to the Arduino ground.",
    raspberryPi: "Requires a 3.3 V-compatible stepper driver and external motor power. Do not connect motor windings directly to Raspberry Pi GPIO."
  },
  {
    names: ["M200 Motor"],
    arduino: "This brushless motor requires a configured VESC or compatible brushless ESC plus a suitable external power source; the Arduino provides control only.",
    raspberryPi: "This brushless motor requires a configured VESC or compatible brushless ESC plus a suitable external power source; the Pi provides control only."
  },
  {
    names: ["Raspberry Pi 4 (1GB)", "Raspberry Pi 5 (2GB)", "Raspberry Pi 5 (4GB)", "RPI Kit"],
    arduino: "Use level-safe serial or I²C connections when communicating with an Arduino; verify voltage levels and share ground.",
    raspberryPi: "Use a regulated 5 V supply rated for the specific Pi model. Power motors and servos separately rather than from the Pi headers."
  }
];

const RELATIONSHIPS = [
  ["DC Motors", "L298N motor driver", "compatible_driver", 2, 1, "One L298N can control up to two brushed DC motors. Use separate motor power and connect the logic ground."],
  ["DC Gearbox", "L298N motor driver", "compatible_driver", 2, 1, "These brushed DC gearmotors require an H-bridge. One L298N can control up to two motors."],
  ["TT Gearbox motor", "L298N motor driver", "compatible_driver", 2, 1, "TT gearmotors require an H-bridge for speed and direction control. One L298N can control up to two motors."],
  ["Type 130", "L298N motor driver", "compatible_driver", 2, 1, "Type-130 motors must not be driven from GPIO. One L298N can control up to two motors with external motor power."],
  ["28BYJ-48 stepper", "4 Phase ULN2003 Stepper Motor Driver", "compatible_driver", 1, 1, "Each 28BYJ-48 stepper requires one ULN2003 driver board."],
  ["Grover Stepper Motor", "L298N motor driver", "recommends", 1, 1, "This stepper needs a suitable bipolar driver. The L298N can drive one stepper, but verify winding current before connecting it."],
  ["M200 Motor", "Vesc motor controllers", "compatible_driver", 1, 1, "Each M200 brushless motor requires a configured VESC or another suitably rated brushless ESC."],
  ...SERVO_NAMES.map(function (name) {
    return [name, "Servo Driver", "recommends", 16, 2, "For multiple servos, use a multi-channel servo driver and a separate power supply matched to the servo voltage and total current."];
  })
];

async function seedRelationships(database) {
  return database.transaction(async function (transaction) {
    let guidanceUpdated = 0;
    let relationshipsUpserted = 0;

    for (const group of GUIDANCE) {
      const result = await transaction.query(
        `UPDATE checkout_components
            SET arduino_guidance = CASE WHEN arduino_guidance = '' THEN $2 ELSE arduino_guidance END,
                raspberry_pi_guidance = CASE WHEN raspberry_pi_guidance = '' THEN $3 ELSE raspberry_pi_guidance END,
                updated_at = NOW()
          WHERE name = ANY($1::text[])
            AND (arduino_guidance = '' OR raspberry_pi_guidance = '')`,
        [group.names, group.arduino, group.raspberryPi]
      );
      guidanceUpdated += result.rowCount;
    }

    for (const relationship of RELATIONSHIPS) {
      const result = await transaction.query(
        `INSERT INTO checkout_component_relationships
          (source_component_id, target_component_id, relation_type, quantity_ratio, minimum_source_quantity, message)
         SELECT source.id, target.id, $3, $4, $5, $6
           FROM checkout_components source, checkout_components target
          WHERE LOWER(source.name) = LOWER($1) AND LOWER(target.name) = LOWER($2)
         ON CONFLICT (source_component_id, target_component_id, relation_type) DO UPDATE
           SET quantity_ratio = EXCLUDED.quantity_ratio,
               minimum_source_quantity = EXCLUDED.minimum_source_quantity,
               message = EXCLUDED.message
         RETURNING id`,
        relationship
      );
      relationshipsUpserted += result.rowCount;
    }

    const actor = await transaction.query(
      "SELECT id FROM checkout_users WHERE role = 'admin' ORDER BY id LIMIT 1"
    );
    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, message)
       VALUES ($1, $2)`,
      [actor.rows[0] ? actor.rows[0].id : null,
        `Seeded component compatibility guidance (${guidanceUpdated} components, ${relationshipsUpserted} relationships).`]
    );
    return { guidanceUpdated, relationshipsUpserted };
  });
}

async function main() {
  const database = await getDatabase();
  const result = await seedRelationships(database);
  process.stdout.write(`Updated guidance for ${result.guidanceUpdated} components and upserted ${result.relationshipsUpserted} relationships.\n`);
  await resetDatabaseForTests();
}

if (require.main === module) {
  main().catch(async function (error) {
    console.error(error);
    await resetDatabaseForTests().catch(function () {});
    process.exitCode = 1;
  });
}

module.exports = { GUIDANCE, RELATIONSHIPS, seedRelationships };
