const { hashPassword } = require("./checkout-security");

const SAMPLE_COMPONENTS = [
  ["Arduino Uno", "Beginner-friendly microcontroller board for sensors and actuators.", "Microcontroller", "Arduino", 24, 2],
  ["Raspberry Pi 5", "Single-board computer for vision, networking, and edge applications.", "Pi-related", "Raspberry Pi", 12, 2],
  ["HC-SR04 Ultrasonic Sensor", "Distance sensor with a 2–400 cm working range.", "Distance", "Arduino + Raspberry Pi", 36, 4],
  ["SG90 Servo Motor", "Compact positional servo for lightweight mechanisms.", "Motor", "Arduino + Raspberry Pi", 40, 4],
  ["Raspberry Pi Camera Module", "Camera module for computer vision prototypes.", "Camera", "Raspberry Pi", 10, 1],
  ["Breadboard + Jumper Kit", "Reusable solderless breadboard and jumper wires.", "Electronics", "Arduino + Raspberry Pi", 50, 2]
];

async function seedCheckout(database, options) {
  const settings = options || {};
  const username = settings.adminUsername || process.env.CHECKOUT_ADMIN_USERNAME || "admin";
  const password = settings.adminPassword || process.env.CHECKOUT_ADMIN_PASSWORD;
  const displayName = settings.adminName || process.env.CHECKOUT_ADMIN_NAME || "MakeCU Admin";

  if (!password || password.length < 10) {
    throw new Error("Set CHECKOUT_ADMIN_PASSWORD to at least 10 characters before seeding.");
  }

  const passwordHash = await hashPassword(password);

  await database.query(
    `INSERT INTO checkout_users (username, password_hash, role, display_name)
     VALUES ($1, $2, 'admin', $3)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name,
           active = TRUE`,
    [username.toLowerCase(), passwordHash, displayName]
  );

  if (settings.samples !== false) {
    for (const component of SAMPLE_COMPONENTS) {
      await database.query(
        `INSERT INTO checkout_components
          (name, description, category, compatibility, total_quantity, max_active_per_team)
         SELECT $1, $2, $3, $4, $5, $6
          WHERE NOT EXISTS (SELECT 1 FROM checkout_components WHERE LOWER(name) = LOWER($1))`,
        component
      );
    }
  }

  return { username: username.toLowerCase(), componentCount: SAMPLE_COMPONENTS.length };
}

module.exports = { SAMPLE_COMPONENTS, seedCheckout };
