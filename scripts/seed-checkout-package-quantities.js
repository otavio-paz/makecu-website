const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const service = require("../api/_lib/checkout-service");

const PACKAGE_QUANTITY_CORRECTIONS = [
  {
    name: "OCR 180Pcs Tactile Push Button Switch 10 Values 6x6mm Micro Momentary Tact Button Switches Assortment Kit",
    packageTotal: 1,
    unitTotal: 180,
    maxActivePerTeam: 5,
    basis: "Workbook row 6 and linked OCR listing specify 180 switches."
  },
  {
    name: "240 Pcs 24 Value Micro Momentary Tactile Switch Assortment Kit",
    packageTotal: 1,
    unitTotal: 240,
    maxActivePerTeam: 5,
    basis: "Workbook row 7 and linked QTEATAK listing specify 240 switches."
  },
  {
    name: "10pc Jumpers Pack",
    packageTotal: 3,
    unitTotal: 30,
    maxActivePerTeam: 5,
    basis: "Workbook row 16 records three packs of ten jumpers."
  },
  {
    name: "50Pcs Potentiometer Kit",
    packageTotal: 1,
    unitTotal: 50,
    maxActivePerTeam: 5,
    basis: "Workbook row 22 and linked ALLECIN listing specify 50 potentiometers."
  },
  {
    name: "DC Barrel Jack to Female Thing",
    packageTotal: 1,
    unitTotal: 10,
    maxActivePerTeam: 3,
    basis: "Workbook row 104 links to a ten-piece Chanzon connector pack."
  },
  {
    name: "10Pcs Pressure Resistance Strain Gauge",
    packageTotal: 1,
    unitTotal: 10,
    maxActivePerTeam: 3,
    basis: "Workbook row 118 and linked DAOKI listing specify ten strain gauges."
  },
  {
    name: "Ceramic Capacitors",
    packageTotal: 1,
    unitTotal: 240,
    maxActivePerTeam: 5,
    basis: "Workbook row 162 links to DigiKey HOTC-KIT-KH: 240 capacitors, 24 values with ten of each."
  },
  {
    name: "Resistor Kit",
    packageTotal: 1,
    unitTotal: 365,
    maxActivePerTeam: 5,
    basis: "Workbook row 173 links to DigiKey Yageo RS125: 365 resistors, 73 values with five of each."
  }
];

function updateInput(component, correction) {
  return {
    id: component.id,
    expectedVersion: component.version,
    name: component.name,
    description: component.description,
    imageUrl: component.imageUrl,
    imageAlt: component.imageAlt,
    category: component.category,
    compatibility: component.compatibility,
    arduinoGuidance: component.arduinoGuidance,
    raspberryPiGuidance: component.raspberryPiGuidance,
    binLocation: component.binLocation,
    technicalSpecs: component.technicalSpecs,
    totalQuantity: correction.unitTotal,
    unavailableQuantity: component.unavailableQuantity,
    protectedStock: component.protectedStock,
    maxActivePerTeam: correction.maxActivePerTeam,
    active: component.active,
    adminNotes: component.adminNotes,
    relationships: component.relationships,
    changeReason: `Converted package-level inventory to individual checkout units. ${correction.basis}`
  };
}

async function applyPackageQuantityCorrections(database) {
  return database.transaction(async function (transaction) {
    const actorResult = await transaction.query(
      "SELECT id, username, role, display_name FROM checkout_users WHERE role = 'admin' AND active = TRUE ORDER BY id LIMIT 1"
    );
    const actorRow = actorResult.rows[0];

    if (!actorRow) {
      throw new Error("Seed an active admin before applying package quantity corrections.");
    }

    const actor = {
      id: Number(actorRow.id),
      username: actorRow.username,
      role: actorRow.role,
      display_name: actorRow.display_name,
      displayName: actorRow.display_name
    };
    const components = await service.catalog(transaction, actor, true);
    const byName = new Map(components.map(function (component) {
      return [component.name.toLocaleLowerCase("en-US"), component];
    }));
    const result = { updated: [], unchanged: [], missing: [] };

    for (const correction of PACKAGE_QUANTITY_CORRECTIONS) {
      const component = byName.get(correction.name.toLocaleLowerCase("en-US"));

      if (!component) {
        result.missing.push(correction.name);
        continue;
      }

      if (component.totalQuantity === correction.unitTotal &&
          component.maxActivePerTeam === correction.maxActivePerTeam) {
        result.unchanged.push(correction.name);
        continue;
      }

      if (component.totalQuantity !== correction.packageTotal &&
          component.totalQuantity !== correction.unitTotal) {
        throw new Error(`${correction.name} has total ${component.totalQuantity}; expected package total ${correction.packageTotal} or corrected total ${correction.unitTotal}.`);
      }

      const updated = await service.saveComponent(transaction, updateInput(component, correction), actor);
      result.updated.push({
        name: updated.name,
        previousTotal: component.totalQuantity,
        totalQuantity: updated.totalQuantity,
        maxActivePerTeam: updated.maxActivePerTeam
      });
    }

    return result;
  });
}

async function main() {
  const database = await getDatabase();
  const result = await applyPackageQuantityCorrections(database);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await resetDatabaseForTests();
}

if (require.main === module) {
  main().catch(async function (error) {
    console.error(error);
    await resetDatabaseForTests().catch(function () {});
    process.exitCode = 1;
  });
}

module.exports = { PACKAGE_QUANTITY_CORRECTIONS, applyPackageQuantityCorrections };
