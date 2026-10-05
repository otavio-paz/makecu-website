# Checkout inventory quantity audit

**Source:** `MakeCU Hardware List 2026.xlsx`, sheet `Full Inventory Check 10-4-26`

## Counting rule

Availability should represent the smallest unit that a team can actually request and receive. A box of interchangeable loose parts is counted by its pieces. A functional set whose halves are normally used together remains one checkout unit. The physical inventory still needs verification before the competition because the workbook confirms only a minority of rows.

## Package counts corrected

| Workbook row | Catalog item | Package quantity | Individual availability | Team maximum | Evidence |
|---:|---|---:|---:|---:|---|
| 6 | OCR tactile switch assortment | 1 box | 180 | 5 | The linked OCR product contains 180 switches across ten sizes. |
| 7 | QTEATAK tactile switch assortment | 1 box | 240 | 5 | The linked QTEATAK product contains 240 switches across 24 sizes. |
| 16 | 10pc Jumpers Pack | 3 packs | 30 | 5 | The workbook name records ten jumpers per pack. |
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

## Proposed merges requiring approval

No items in this section have been combined.

1. **Assorted tactile switches.** The OCR 180-piece kit, QTEATAK 240-piece kit, and `Push Buttons` are probably best presented as `Tactile Push Buttons (Assorted)`. `Push Buttons` links to the same ASIN as the 240-piece QTEATAK box and is likely a duplicate row rather than one additional switch. Confirm the physical boxes before using a total of 420. `Misc. Buttons` could join only after confirming that its 20 pieces are ordinary passive momentary switches.
2. **Do not fold every switch into that item.** `Touch Button` is a capacitive module; rocker, toggle, tilt, Grove, and unidentified miscellaneous switches have different electrical or mechanical behavior. Keep them separate unless the physical review shows otherwise.
3. **Ceramic capacitors.** `Ceramic Capacitor`, misspelled `Cermaic Capacitor`, and `Ceramic Capacitors` may overlap. The 240-piece kit contains specific values, so confirm whether teams need to select a value before merging the generic rows.
4. **Jumper wires.** `10pc Jumpers Pack`, `Jumpers`, and the three gender-specific jumper-wire rows could be consolidated only if connector gender does not matter to the checkout workflow. Keeping the three known gender types separate is safer.
5. **Potential duplicate hardware.** Review `Logitech Webcam`/`Logitech Webcams`, `12V DC-DC Converters`/`DC-DC Converter`, the two pluggable-terminal-block rows, and the two IR break-beam rows against the physical labels before merging.
6. **Kit and paired workflows.** `Audio Amplifier` and `Dweii Mini Speaker` are marked as halves of a speaker kit and could become a relationship or a combined kit. `Elegoo starter Kit`/`Elegoo Kit` and `Sensor Kit`/`Sensors from Elegoo sensor Kit` may also overlap, but the workbook does not prove that they are identical.

The importer already consolidated exact repeated names such as `IMU`, `Moisture sensor`, `Thin Film Precision Resistor`, and `Vibration Motors`. During the physical review, verify that those rows truly represent interchangeable models.
