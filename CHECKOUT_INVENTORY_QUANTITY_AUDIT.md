# Checkout inventory quantity audit

**Source:** `MakeCU Hardware List 2026.xlsx`, sheet `Full Inventory Check 10-4-26`

## Counting rule

Availability should represent the smallest unit that a team can actually request and receive. A box of interchangeable loose parts is counted by its pieces. A functional set whose halves are normally used together remains one checkout unit. The physical inventory still needs verification before the competition because the workbook confirms only a minority of rows.

## Package counts corrected

| Workbook row | Catalog item | Package quantity | Individual availability | Team maximum | Evidence |
|---:|---|---:|---:|---:|---|
| 6 | OCR tactile switch assortment | 1 box | 180 | 5 | The linked OCR product contains 180 switches across ten sizes. |
| 7 | QTEATAK tactile switch assortment | 1 box | 240 | 5 | The linked QTEATAK product contains 240 switches across 24 sizes. |
| 16 | 10pc Jumpers Pack | 3 packs | 30 | 5 | The workbook name records ten jumpers per pack. This row was later removed because loose jumper wires are freely available and no longer tracked. |
| 22 | 50Pcs Potentiometer Kit | 1 box | 50 | 5 | The workbook and linked product identify 50 potentiometers. |
| 104 | DC Barrel Jack to Female Thing | 1 pack | 10 | 3 | The linked Chanzon product is a ten-piece female connector pack. |
| 118 | 10Pcs Pressure Resistance Strain Gauge | 1 pack | 10 | 3 | The linked DAOKI product contains ten BF350 strain gauges. |
| 162 | Ceramic Capacitors | 1 kit | 240 | 5 | DigiKey HOTC-KIT-KH contains 240 capacitors: 24 values with ten of each. |
| 173 | Resistor Kit | 1 kit | 365 | 5 | DigiKey Yageo RS125 contains 365 resistors: 73 values with five of each. |

The correction script is idempotent and refuses to overwrite an unexpected manually edited total. It records each change through the normal inventory audit trail:

```powershell
$env:CHECKOUT_PGLITE_PATH="./checkout-catalog-preview-data"
npm run checkout:seed-package-quantities
```

## Package counts already represented as pieces

These workbook quantities already appear to count the individual units rather than the outer package, so no correction was made:

- Ethernet Cable (1ft, 10GB): five cables from a five-pack listing;
- Touch Button: 30 modules;
- 3MM Photodiode: 20 pieces;
- 41mm Piezo Disc: 20 pieces;
- 5MM Phototransistor: 20 pieces;
- Light Dependent Resistor: 100 pieces;
- female-to-female, male-to-female, and male-to-male jumper wires: 40 each.

`Pair of Pluggable Terminal Block` remains one checkout unit because the plug and receptacle form one usable pair. Complete systems such as Elegoo kits, Raspberry Pi kits, RFID kits, and sensor kits also remain kit-level inventory until organizers decide to split their contents.

## Approved consolidations

The following consolidations were approved and are applied by `npm run checkout:merge-components`:

| Combined catalog item | Source rows | Combined total | Notes |
|---|---|---:|---|
| Tactile Push Buttons (Assorted) | OCR 180-piece kit; QTEATAK 240-piece kit; Push Buttons; Misc. Buttons | 440 | `Push Buttons` reused the 240-piece kit link, so its quantity of one was treated as a duplicate rather than an additional switch. The 20 miscellaneous buttons were added to the combined total. |
| Ceramic Capacitors (Assorted) | Ceramic Capacitor; Cermaic Capacitor; Ceramic Capacitors | 270 | Includes 10 loose, 20 loose, and the 240-piece assortment. Protected stock is combined as three. |
| Logitech Webcams | Logitech Webcam; Logitech Webcams | 10 | Singular and plural inventory rows combined. |
| DC-DC Converters | 12V DC-DC Converters; DC-DC Converter | 7 | Uses a generic combined name because the exact modules may differ. |
| Ultrasonic Sensors | Ultrasonic Sensor; Ultrasonic Distance Module | 9 | Both entries represent ultrasonic distance modules and use the same checkout guidance. |

The merge is transactional and idempotent. It transfers active order, team-holding, return, audit, and relationship references to the retained component while preserving historical snapshot names.

## Similar entries that still require approval

1. **Do not fold every switch into the tactile item.** `Touch Button` is a capacitive module; rocker, toggle, tilt, Grove, and unidentified miscellaneous switches have different electrical or mechanical behavior. Keep them separate unless the physical review shows otherwise.
2. **Other capacitors.** Keep the generic `Capacitor` inventory separate because it may contain electrolytic or other polarized parts.
3. **Potential duplicate hardware.** Review the two pluggable-terminal-block rows and the two IR break-beam rows against the physical labels before merging.
4. **Kit and paired workflows.** `Audio Amplifier` and `Dweii Mini Speaker` are marked as halves of a speaker kit and could become a relationship or a combined kit. `Elegoo starter Kit`/`Elegoo Kit` and `Sensor Kit`/`Sensors from Elegoo sensor Kit` may also overlap, but the workbook does not prove that they are identical.

## Untracked loose wiring

The catalog no longer tracks `10pc Jumpers Pack`, `Jumpers`, or the male-to-male, male-to-female, and female-to-female jumper-wire rows. They are treated as freely available consumables. `Grove Wire` and `Wire Spool` remain separate because they are specialized cables or bulk supplies rather than loose Dupont jumpers.

## Organizer-added item

`Pin Headers` was added with 25 units, two protected units, and a maximum of five per team based on the organizer's explicit inventory update. Its photo is stored with the other local component images.

The importer already consolidated exact repeated names such as `IMU`, `Moisture sensor`, `Thin Film Precision Resistor`, and `Vibration Motors`. During the physical review, verify that those rows truly represent interchangeable models.
