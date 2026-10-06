const crypto = require("node:crypto");

const descriptions = {
  "Adafruit Microphone Breakout": "I2S MEMS microphone breakout for capturing digital audio without an analog input. Connect its clock, word-select, and data lines to a compatible microcontroller or Raspberry Pi.",
  "Audio Amplifier": "PAM8302 single-channel Class-D amplifier board for driving a small speaker from a low-level audio signal. Pair it with the mini speaker for sound effects or voice output.",
  "Dweii Mini Speaker": "Compact JST-PH wired loudspeaker for alarms, tones, and speech output. It needs an amplifier board; a GPIO pin should not drive it directly.",
  "Electret Condenser Microphone Pickup (2 Pins, 9×7mm)": "Two-pin 9×7 mm electret microphone capsule for analog sound sensing. Use a bias/preamp circuit, and add an ADC when connecting it to a Raspberry Pi.",

  "Tactile Push Buttons (Assorted)": "Assorted 6×6 mm momentary tactile push buttons in multiple actuator heights for breadboard controls, reset inputs, and compact user interfaces.",
  "Ceramic Capacitors (Assorted)": "Assorted non-polarized ceramic capacitors for decoupling, filtering, and timing circuits. Check the marked capacitance and voltage rating when selecting a part.",
  "DC-DC Converters": "Adjustable DC-DC converter modules for changing one DC voltage to another. Verify each module's input range, output setting, polarity, and current limit before connecting a load.",
  "Ultrasonic Sensors": "HC-SR04-style ultrasonic distance sensors for non-contact ranging, obstacle detection, and tank-level prototypes. Protect 3.3 V GPIO from a 5 V echo output when required.",
  "Pin Headers": "Breakaway male pin-header strips for adding board connections, making adapters, and exposing signals. Cut or snap off the required number of positions and solder them in place.",

  "240 Pcs 24 Value Micro Momentary Tactile Switch Assortment Kit": "Assorted momentary tactile switches in multiple actuator heights for breadboard controls, reset inputs, and compact user interfaces.",
  "Grove Button": "Grove momentary push-button module with a ready-to-use digital output. Connect it through a Grove cable or base shield for a simple user input.",
  "Grove Touch Sensor": "Grove capacitive touch module that produces a digital signal when its pad is touched. Useful for touch controls without a mechanical switch.",
  "Misc. Buttons": "Mixed momentary buttons for breadboard and panel controls. Verify each button's pin layout and use a pull-up or pull-down in the input circuit.",
  "Misc. Switches": "Mixed maintained and momentary switches for power, mode selection, and digital inputs. Check contact arrangement and ratings before wiring a load.",
  "OCR 180Pcs Tactile Push Button Switch 10 Values 6x6mm Micro Momentary Tact Button Switches Assortment Kit": "6×6 mm momentary tactile-switch assortment with ten actuator heights. Good for breadboard buttons, reset controls, and custom control panels.",
  "Push Buttons": "Assorted micro momentary tactile push buttons for breadboard inputs. The contacts close only while pressed, making them suitable for triggers and menu controls.",
  "Rocker Switch": "Adam Tech SW-R3 panel-mount SPST on/off rocker switch rated 6 A at 125 VAC. Use it as a maintained power or mode switch within the circuit's safe rating.",
  "Touch Button": "TTP223 capacitive-touch module with a digital output and configurable momentary or toggle behavior. It can act as a button behind a thin nonmetal surface.",

  "Arducam 5MP Camera": "5-megapixel OV5647 camera module for the Raspberry Pi CSI camera connector. Suitable for computer vision, time-lapse, and image-capture projects.",
  "ESP (Wifi + Bluetooth) with Camera": "ESP32-CAM development board combining an OV2640 camera with Wi-Fi and Bluetooth. Program it as a self-contained wireless camera; a USB-to-serial adapter may be needed.",
  "Logitech Webcam": "USB Logitech webcam for plug-and-play video capture on a Raspberry Pi or computer. Useful for vision, streaming, and video-call prototypes.",
  "Logitech Webcams": "USB Logitech webcams for plug-and-play image and video capture. Check the attached model and available Linux support before relying on a specific resolution or frame rate.",
  "Mini Spy Camera 1528-1799-ND": "Compact Adafruit mini spy camera module for small embedded video projects. Confirm its video interface and power requirements before connecting it to a controller.",
  "USB Cameras": "USB camera modules intended for Raspberry Pi and computer vision projects. They avoid the CSI connector and are useful for OpenCV, streaming, or visual inspection.",

  "Echo DOT": "Amazon Echo Dot smart speaker with microphones, Wi-Fi, and Alexa. Useful as a voice-interface endpoint or smart-home integration target rather than a directly wired sensor.",
  "Echo Show": "Amazon Echo Show smart display with voice control, screen, microphones, and Wi-Fi. Useful for dashboard, notification, and smart-home integration demos.",
  "Google Home Mini": "First-generation Google Home Mini smart speaker with Google Assistant and Wi-Fi. Useful for voice-command and home-automation integrations.",

  "Pseudo-LiDAR Sensor": "Single-point time-of-flight distance sensor with a serial communication interface. It provides narrow-beam ranging for obstacle detection and position measurements.",
  "Ultrasonic Distance Module": "Ultrasonic ranging module for non-contact distance measurements. Trigger a pulse and time the echo; level-shift the return signal when required by a 3.3 V controller.",
  "Ultrasonic Sensor": "HC-SR04 ultrasonic distance sensor with trigger and echo pins. Useful for obstacle detection and tank-level demos; protect 3.3 V GPIO from its 5 V echo output.",

  "10k Trimmer": "10 kΩ adjustable trimmer potentiometer for calibrating thresholds, bias voltages, and analog settings. Turn the screw to vary the wiper resistance.",
  "10pc Jumpers Pack": "Pack of jumper leads for temporary breadboard and header connections. Use them for signal, power, and ground wiring during rapid prototyping.",
  "12V DC-DC Converters": "DC-DC converter modules for deriving a regulated supply from a 12 V source. Verify each module's input range, output setting, polarity, and current limit before use.",
  "1309 Series Sonic Hub (6mm Bore)": "goBILDA 1309-series clamping hub with a 6 mm bore for attaching wheels, gears, or structures to a matching shaft. Confirm the hub pattern and fasteners at checkout.",
  "1N5817 Diode": "1N5817 Schottky rectifier diode with low forward voltage, commonly used for reverse-polarity protection, flyback paths, and low-voltage power conversion.",
  "23904 Transistor": "2N3904 general-purpose NPN transistor for low-current switching and signal amplification. Add an appropriate base resistor when driving it from a GPIO pin.",
  "4-Digit 7-segment LED (with driver)": "Four-digit numeric LED display with an onboard driver, reducing the number of GPIO pins needed for counters, timers, scores, and sensor readouts.",
  "50Pcs Potentiometer Kit": "Assorted rotary potentiometers for adjustable analog controls such as volume, thresholds, and setpoints. A Raspberry Pi needs an external ADC to read the wiper voltage.",
  "5V 650nm 5mW Red Dot Laser": "5 V, 650 nm red laser-dot module for alignment, tripwire, and optical experiments. Treat it as a laser source: never aim it at eyes or reflective surfaces.",
  "7 Segment Serial Display": "SparkFun serial seven-segment display for numeric output over a compact serial interface. Useful for counters and measurements when GPIO pins are limited.",
  "8X8 LED Matrix": "8×8 LED matrix for icons, animations, and low-resolution visualizations. Use a suitable matrix driver or multiplexing circuit to control its 64 LEDs.",
  "9V to dc jack": "9 V battery clip to barrel-jack adapter for powering compatible low-current devices. Confirm barrel polarity and the device's accepted input voltage first.",
  "Breadboards": "Solderless prototyping boards for quickly assembling and changing through-hole circuits. Their internal rows and power rails make them ideal for early hardware tests.",
  "Buck Booster": "Buck-boost DC-DC regulator that can step an input voltage up or down to a regulated output. Set and verify the output with a multimeter before connecting electronics.",
  "CN0023": "CN0023 interface board from the inventory for connecting its matching hardware assembly. Inspect the board labels and pinout before power is applied because the exact revision is not identified.",
  "Capacitor": "Assorted capacitors for decoupling, filtering, timing, and energy storage. Match capacitance and voltage rating, and observe polarity on electrolytic parts.",
  "Ceramic Capacitor": "Non-polarized ceramic capacitor for high-frequency decoupling, filtering, and timing circuits. Read the value code and stay within the rated voltage.",
  "Ceramic Capacitors": "Vishay ceramic-capacitor assortment for decoupling, filtering, and timing. These non-polarized parts are useful close to IC power pins and in small signal networks.",
  "Cermaic Capacitor": "Non-polarized ceramic capacitor for decoupling, filtering, and timing circuits. Check its marked value and voltage rating before installation.",
  "DC 5V Relay Module": "5 V optocoupled relay module for switching a separate load from a microcontroller signal. Keep high-voltage wiring isolated and within the relay contact rating.",
  "DC-DC Converter": "Adjustable DC-DC power converter for changing one DC voltage to another. Verify input range, output polarity, voltage, and available current before attaching a load.",
  "DC5V Black Mini Active Piezo Buzzers": "5 V active piezo buzzers with a built-in oscillator, so DC power produces a tone. Drive them through a transistor if their current exceeds the GPIO limit.",
  "Display": "Adafruit graphical display module for embedded text and graphics. Confirm the exact controller, interface, voltage, and library from the board markings before wiring it.",
  "Elegoo starter Kit": "ELEGOO Arduino starter collection with a controller and common sensors, actuators, displays, and prototyping parts. Useful when a project needs several basic components together.",
  "Ethernet Breakout": "SparkFun RJ45 MagJack breakout exposing an Ethernet jack with integrated magnetics. It is a physical-layer connector board, not a complete Ethernet controller.",
  "Female to Female Jumper Wire": "Female-to-female Dupont jumper leads for joining male headers without soldering. Useful for connecting modules, breakout boards, and development boards.",
  "Gemma": "Adafruit Gemma wearable microcontroller board for compact LED, sensor, and costume projects. Check the board revision before selecting USB drivers and pin mappings.",
  "Grove LCD": "Grove character LCD module with a simplified cable interface for showing status, menus, and sensor values. Use a Grove cable/base shield or wire the bus directly.",
  "Grove LED": "Grove LED module with the LED and support components already on a small board. Connect it through Grove or a digital output for indicators and simple light effects.",
  "Grove Wire": "Grove-compatible four-conductor cable for power plus digital, analog, I2C, or UART module connections. Match the cable orientation and port type on both ends.",
  "Hex Inverter Buffer": "Six-channel logic inverter/buffer IC for signal inversion, edge cleanup, and simple digital interfacing. Identify the exact part number to determine logic family and supply voltage.",
  "Inductors": "Assorted inductors for filters, energy storage, and power-converter experiments. Select by inductance, current rating, and resistance to avoid saturation or overheating.",
  "JST Headers 4 pin female": "JST four-position female connector housing for making keyed cable assemblies. Use matching terminals and verify pitch and series before crimping.",
  "JST Headers 4 pin male": "JST four-position male PCB header for a keyed wire-to-board connection. The linked part is a surface-mount PH-series header; use its matching housing and pitch.",
  "JST Headers 8 pin male": "JST eight-position male XH-series through-hole PCB header for keyed wire-to-board connections. Pair it with the matching housing and terminals.",
  "Joystick": "Two-axis analog joystick breakout with a push-button switch for directional controls. Microcontrollers can read it directly; Raspberry Pi projects need an ADC for the axes.",
  "Jumpers": "Jumper wires for temporary signal, power, and ground connections on breadboards and pin headers. Select the connector gender that matches both endpoints.",
  "LCD Display": "1602A-compatible 16×2 character LCD for menus and sensor readouts. It uses the common HD44780-style parallel interface unless paired with an I2C backpack.",
  "LED Green": "Green indicator LED for status lights and simple optical experiments. Always add a current-limiting resistor and observe polarity.",
  "Load Cell Amplifier": "SparkFun HX711 load-cell amplifier and 24-bit ADC breakout for converting a strain-gauge bridge into precise digital weight readings.",
  "Male to Female Jumper Wire": "Male-to-female Dupont jumper leads for connecting a breadboard or female socket to a male header on a sensor or development board.",
  "Male to Male Jumper Wire": "Male-to-male Dupont jumper leads for breadboard wiring and connections between female headers. Useful for rapid, solderless prototypes.",
  "Misc. LEDs": "Mixed LEDs for indicators, light effects, and optical sensing experiments. Identify color and polarity, then use an appropriate current-limiting resistor.",
  "Motor Replacement Package": "Replacement mechanical and electrical parts for the matching motor assembly. Use it for repairs and confirm shaft, mounting, and connector compatibility before checkout.",
  "Multiplexer": "Electronic multiplexer for selecting one of several signals with a smaller number of control pins. Identify the exact IC to confirm channel count, voltage range, and analog or digital behavior.",
  "Packs of mounting/replacement": "Assorted mounting and replacement hardware for repairing or securing inventory components. Check sizes and hole patterns against the mechanism before checkout.",
  "Pair of Pluggable Terminal Block": "Mating pluggable terminal-block pair for removable power or signal wiring. Verify pitch, position count, wire gauge, and current rating before use.",
  "Passive Eletronics Kit": "Assortment of passive parts such as resistors, capacitors, and related components for filters, bias networks, timing, and circuit prototyping.",
  "Pluggable Terminal Blocks": "Adam Tech two-position pluggable terminal block for detachable wire connections. Useful for power and field wiring that must be removed without unscrewing the PCB side.",
  "Power Hub": "Multi-output power distribution hub for feeding several devices from one supply. Confirm input voltage, output polarity, connector type, and total current before connecting hardware.",
  "RF 433MHz receiver": "433 MHz RF receiver module for simple one-way wireless links and remote-control experiments. It needs a compatible transmitter and protocol-decoding code.",
  "RF receiver": "Radio-frequency receiver module for receiving data from its matching transmitter. Identify its frequency and output protocol before choosing an antenna or library.",
  "Real Time Clock Module IC": "Battery-backed real-time clock module for keeping date and time while the main controller is off. Most modules communicate over I2C; confirm the onboard IC.",
  "Resistor Kit": "Yageo through-hole resistor assortment for current limiting, pull-ups, voltage dividers, biasing, and signal conditioning. Read the color code or measure before use.",
  "Rotors": "Assorted motor rotors or rotating hardware for compatible motor assemblies. Match shaft size, balance, and mounting before spinning at speed.",
  "Sense CAP Indicator": "SenseCAP indicator/display unit for showing data from compatible sensors and connected services. Confirm the exact SenseCAP model and supported inputs before planning integration.",
  "Sensor Kit": "Assorted sensor modules for Arduino-style experiments, typically covering light, sound, motion, temperature, and simple input devices. Select modules individually as needed.",
  "Sensors from Elegoo sensor Kit": "Loose modules from an ELEGOO Arduino sensor kit for quick experiments with environmental, motion, and user-input signals. Check each board label for its interface.",
  "Servo Driver": "Multi-channel servo-control board for generating stable control pulses without consuming many microcontroller timers. Supply servo power separately from logic when required.",
  "Solder Pad": "Solderable prototyping pad or board for making a more permanent version of a breadboard circuit. Plan power rails and continuity before soldering.",
  "Solderless Breadboard": "830-point solderless breadboard for reusable through-hole prototypes. It provides connected terminal rows and power rails without requiring solder.",
  "SparkFun Snappable protoboard": "SparkFun perforated prototyping board that can be snapped into smaller sections. Use it to solder compact, durable versions of breadboard circuits.",
  "Thin Film Precision Resistor": "Precision thin-film resistor for accurate gain, filtering, sensing, and reference networks. Confirm the printed resistance, tolerance, package, and power rating.",
  "Through Hole Mosfet": "IRFZ44N N-channel power MOSFET in a through-hole package for switching higher-current DC loads. Use a gate resistor, flyback protection for inductive loads, and adequate cooling.",
  "Toggle Switch SPDT Panel Mount": "C&K E101-series panel-mount SPDT toggle switch for selecting between two signal paths or modes. Check the center position and contact rating for the exact part.",
  "USB 3.1TYPE male plug breakout": "USB Type-C male plug breakout that exposes connector pins for power or USB experiments. Follow USB-C configuration and signal-integrity requirements rather than treating every pin as general-purpose.",
  "Vanja SD Card Reader": "USB SD and microSD card reader for preparing Raspberry Pi media or transferring project data. Verify the card is unmounted before removal.",
  "Vesc NRF dongle": "nRF radio dongle for wireless communication with compatible VESC motor controllers. Use it with the matching VESC toolchain and firmware.",
  "Vesc motor controllers": "VESC-compatible electronic speed controllers for brushless motor control with configurable current, braking, and communication settings. Configure safely before connecting a motor.",
  "Wireless Charger": "Inductive wireless-power module for transferring low-voltage power across a small air gap. Align the coils and verify output voltage and current before powering a project.",
  "Wireless Transmitter": "433 MHz RF transmitter/receiver pair for simple wireless data links. The modules expose basic serial/digital signaling and need matching antennas and software framing.",
  "XBee 3 PCB Antenna": "Digi XBee 3 radio with PCB antenna supporting 802.15.4, Zigbee, BLE, UART/SPI, and MicroPython. Use an XBee socket, shield, or explorer dongle rather than standard 0.1-inch headers.",
  "XBee Shield (Wireless transceiver)": "Arduino-form-factor shield for mounting and communicating with an XBee radio. It provides the socket and serial routing needed for wireless links.",
  "mePED PCB board": "Custom mePed robot PCB for the matching Arduino-based walking-robot hardware. Use the board silkscreen and project pinout to connect servos, power, and controller correctly.",

  "Arduino and Base Shields": "Arduino-compatible controller boards and base shields for quickly connecting Grove or shield-format modules. Match the board voltage and shield pinout before stacking.",
  "Elegoo Kit": "ELEGOO Arduino project kit with a controller, breadboard, common sensors, displays, motors, and passives. Useful as an all-in-one starting point for mixed prototypes.",
  "RPI Kit": "Raspberry Pi project kit with a Pi and supporting accessories. Check the case, power supply, storage, and included Pi model before checkout.",
  "Raspberry Pi 4 (1GB)": "Raspberry Pi 4 Model B with 1 GB RAM, a 1.5 GHz quad-core 64-bit CPU, USB 3, Gigabit Ethernet, dual-band Wi-Fi, Bluetooth, and a 40-pin GPIO header.",
  "Raspberry Pi 5 (2GB)": "Raspberry Pi 5 with 2 GB RAM, a 2.4 GHz quad-core Cortex-A76 CPU, Wi-Fi, Bluetooth, Gigabit Ethernet, USB 3, dual 4K display output, and a 40-pin GPIO header.",
  "Raspberry Pi 5 (4GB)": "Raspberry Pi 5 with 4 GB RAM, a 2.4 GHz quad-core Cortex-A76 CPU, Wi-Fi, Bluetooth, Gigabit Ethernet, USB 3, dual 4K display output, and a 40-pin GPIO header.",

  "2000 Series Dual Mode servo": "goBILDA 2000-series dual-mode servo that can operate as a positional servo or continuous-rotation motor. Choose the torque or speed version and power it from a suitable servo supply.",
  "28BYJ-48 stepper": "Compact geared 5-wire stepper motor for slow, repeatable motion. Drive it through a ULN2003 board rather than directly from controller pins.",
  "4 Phase ULN2003 Stepper Motor Driver": "ULN2003 transistor-array driver board for sequencing a 28BYJ-48 or similar unipolar stepper motor from low-current GPIO signals.",
  "550 Titan 12-Turn": "Traxxas Titan 550-size 12-turn brushed DC motor for high-speed, higher-current mechanical projects. Use a properly rated motor controller and power source.",
  "9g Micro Servo": "Compact 9 g positional servo for lightweight linkages, pointers, and small mechanisms. It uses the standard power, ground, and control-signal connection.",
  "D646WP servo": "Water-resistant digital servo for higher-load position control. Confirm its voltage, torque, travel, and connector orientation before use.",
  "DC Gearbox": "Small geared DC motor assembly that trades speed for torque. Reverse polarity to reverse direction, and use a motor driver for controller-based speed control.",
  "Dark motors with no name": "Unidentified DC motors for exploratory mechanical prototypes. Measure winding resistance and test at low voltage before choosing a driver or supply.",
  "FT5330M servo": "FT5330M servo actuator for controlled angular motion. Verify its operating voltage, pulse range, torque, and connector orientation before powering it.",
  "Grover Stepper Motor": "SparkFun stepper motor for precise incremental rotation in positioning mechanisms. Use an appropriate bipolar stepper driver and set the current limit before operation.",
  "M200 Motor": "Blue Robotics M200 brushless motor designed for marine and robotics propulsion. It requires a compatible brushless ESC and careful current-limited testing.",
  "MG90S": "MG90S metal-gear micro servo for compact mechanisms needing more durable gearing than an SG90. Control it with standard servo pulses and a suitable 5 V-class supply.",
  "Motor with PCB soldered": "DC motor with an attached interface or suppression PCB. Inspect the board markings and test at low voltage to determine polarity and control requirements.",
  "Nema 17": "NEMA 17-frame bipolar stepper motor for precise positioning in sliders, printers, and robots. Use a current-limiting stepper driver matched to the motor windings.",
  "S3004 servo": "Futaba S3004 standard ball-bearing servo for general positional control. It uses a conventional three-wire servo connection and needs a suitable external supply.",
  "SF3218MG Servo": "High-torque metal-gear digital servo for robotic joints and steering. Confirm voltage, current, and travel settings, and use the matching servo horn and fastener.",
  "SG90 Servo": "SG90 9 g micro servo for lightweight position-control tasks. Drive it with standard servo pulses and avoid powering several servos from a controller's regulator.",
  "TT Gearbox motor": "Yellow TT-style geared DC motor for small wheeled robots. Use an H-bridge motor driver for speed and direction control.",
  "Type 130": "Type-130 miniature brushed DC motor rated for roughly 1.5–6 V hobby use. Suitable for fans, small vehicles, and mechanisms when paired with a transistor or motor driver.",
  "Vibration Motors": "Compact eccentric-rotating-mass motors for haptic feedback and vibration alerts. Switch them with a transistor or driver and include flyback protection when appropriate.",

  "Buck convertor (lipos to PIs)": "Step-down regulator module for converting a LiPo battery voltage to the stable 5 V rail needed by a Raspberry Pi. Set and verify the output before connecting the Pi.",
  "DC Barrel Jack to Female Thing": "Female screw-terminal-to-barrel-jack adapter for connecting bare wires to common DC plugs. Confirm barrel size and center polarity before applying power.",
  "DC Motors": "SparkFun hobby DC motors for simple spinning mechanisms and wheeled robots. Use a transistor or H-bridge rather than driving them directly from GPIO.",
  "Grove Buzzer": "Grove buzzer module for audible alerts and simple tones. Connect it through a Grove cable or digital output; confirm whether the attached buzzer is active or passive.",
  "L298N motor driver": "Dual H-bridge L298N module for controlling the speed and direction of two brushed DC motors or one bipolar stepper. Provide separate motor power and share logic ground.",
  "Motor Shield V2.0": "Arduino motor shield for driving multiple DC motors, steppers, or servos from a dedicated motor supply. Confirm the exact shield library and current limit.",
  "Motor Shield V2.3": "Arduino motor shield revision 2.3 for controlling DC motors, steppers, or servos. Use an external motor supply and the library that matches the board's controller IC.",
  "Pump": "Small peristaltic liquid pump for dosing or moving fluid while keeping it inside flexible tubing. Drive it through a suitable transistor or motor controller.",
  "Wheels": "Robot wheels for small mobile platforms. Match the bore or hub to the motor shaft and keep paired wheels the same diameter.",

  "Ethernet Cable (1ft, 10GB)": "Short Cat6-style Ethernet patch cable for reliable wired networking between a Raspberry Pi, laptop, switch, or router. The listed cable is suitable for up to 10 GbE on short links.",
  "SD Cards (16GB)": "16 GB microSD cards for Raspberry Pi operating systems, data logging, and removable storage. Reimage as needed and eject cleanly to avoid filesystem corruption.",
  "XBee Dongle": "SparkFun XBee Explorer USB dongle that powers an XBee and exposes its serial connection to a computer or Raspberry Pi for configuration and communication.",

  "3S Lipo Battery": "Three-cell lithium-polymer battery pack for high-current mobile projects. Use only with a 3S-compatible charger, monitor cell voltage, and protect it from shorts or physical damage.",
  "Battery Bank": "Portable USB power bank for untethered low-voltage electronics. Check its output current, connector, and auto-shutoff behavior before using it with motors or very small loads.",
  "Wall power supply": "Adjustable AC-to-DC wall adapter for bench or installed power. Set the voltage and plug polarity before connection, and stay below the supply's current rating.",
  "Wire Spool": "SparkFun hookup-wire spool for soldered signal and low-voltage power connections. Select an appropriate gauge and color, then add strain relief where the wire can move.",

  "10Pcs Pressure Resistance Strain Gauge": "BF350-series foil strain gauges for measuring tiny surface deformation in load and force experiments. Bond one to the structure and use a bridge amplifier/ADC such as HX711.",
  "12-key touch sensor": "Twelve-key capacitive-touch keypad module for multi-button user interfaces without mechanical contacts. Read the key states through the module's digital interface.",
  "3MM Photodiode": "3 mm photodiode for detecting light intensity and fast optical signals. Use a bias or transimpedance circuit; a Raspberry Pi requires an external ADC for analog readings.",
  "41mm Piezo Disc": "41 mm piezoelectric disc that can sense taps and vibration or produce simple tones. Condition high-voltage transients when using it as a sensor.",
  "4x4 Matrix Keypad": "Sixteen-button matrix keypad using eight row/column lines. Scan the matrix in software for numeric entry, menus, and access-control prototypes.",
  "50kg Load Cell": "50 kg half-bridge load cell for weight and force measurements. Combine the gauges as required and read them through a load-cell amplifier such as the HX711.",
  "5MM Phototransistor": "5 mm phototransistor for light detection and optical switching. Use a load resistor to produce a voltage; Raspberry Pi projects need an ADC for proportional measurements.",
  "9-DOF IMU + TEMP sensor": "Nine-degree-of-freedom inertial module combining accelerometer, gyroscope, magnetometer, and temperature data for orientation and motion tracking.",
  "Air Quality Sensor": "SparkFun air-quality sensor board for detecting changes in indoor volatile compounds and pollution-related gases. Allow warm-up and treat readings as relative unless calibrated.",
  "Barometer Sense Board": "Adafruit barometric pressure sensor breakout for altitude, pressure, and weather-related measurements. Communicates digitally and is suitable for Arduino or Raspberry Pi projects.",
  "Encoder Sensor - slotted optical interrupter": "MOC7811 slotted optical interrupter that detects when a vane or encoder wheel blocks its light path. Use it for rotation, speed, and position sensing.",
  "GPS Module": "Satellite-navigation module that reports position, time, and motion data over a serial interface. Give it a clear sky view and allow time for the first fix.",
  "Gesture Sensor": "Gesture/proximity sensor module for recognizing hand movements without contact. The linked board is compatible with Arduino and Raspberry Pi digital interfaces.",
  "Grove - Piezo Vibration Sensor": "Grove piezo vibration sensor that produces a signal when the board is tapped or shaken. Useful for knock detection, vibration alarms, and impact sensing.",
  "Grove 3 Axis Digital": "Grove three-axis digital accelerometer module for measuring tilt, motion, and vibration. Connect through Grove/I2C and use the library for the exact onboard sensor.",
  "Grove Light Sensor": "Grove light sensor module that converts ambient brightness into an analog signal. Microcontrollers can read it directly; Raspberry Pi projects need an ADC.",
  "Grove Rotary Angle Sensor": "Grove rotary-angle potentiometer module for knobs, setpoints, and manual controls. It produces an analog voltage proportional to shaft position.",
  "Grove Sound Sensor": "Grove microphone sound-level module for detecting claps, beats, and relative loudness. It is intended for envelope level, not high-fidelity audio recording.",
  "Grove Temp Sensor": "Grove temperature-sensor module for measuring ambient temperature in simple monitoring projects. Confirm the board revision to select the correct conversion formula or library.",
  "Heart Rate Sensor": "MAX30102 optical pulse and blood-oxygen sensing module with an I2C interface. Good skin contact and signal processing are required; it is for prototypes, not medical diagnosis.",
  "IMU": "MPU-6050-style six-axis IMU combining a three-axis accelerometer and three-axis gyroscope over I2C. Useful for tilt, gesture, and motion tracking.",
  "IR Break Beam Sensor": "Infrared emitter/receiver break-beam pair for detecting objects crossing a path. Align both halves and read the receiver's digital change when the beam is blocked.",
  "IR Break Beam Sensor 1528-2526-ND": "Adafruit infrared break-beam sensor pair for object, doorway, and counter detection. The receiver changes output when an aligned beam is interrupted.",
  "Light Dependent Resistor": "Photoresistor whose resistance changes with light level. Use it in a voltage divider; a Raspberry Pi needs an ADC for proportional brightness readings.",
  "MP503 Gas Sensor": "MP-series combustible-gas sensor module with analog and thresholded digital outputs. It requires warm-up and calibration and should not be treated as certified safety equipment.",
  "Moisture sensor": "Soil-moisture probe module with analog and digital outputs for plant and leak-monitoring prototypes. Power it only while measuring to reduce probe corrosion.",
  "Muscle Sensor": "MyoWare surface electromyography sensor that converts muscle activity into an analog signal for gesture and biofeedback prototypes. Follow electrode-placement and electrical-safety guidance.",
  "PIR (motion) sensor": "Passive-infrared motion sensor for detecting changes in warm-body movement. Useful for occupancy triggers and alarms after its startup settling period.",
  "Passive Infrared Sensor": "HC-SR501 passive-infrared motion module with adjustable sensitivity and hold time. It provides a digital motion output for Arduino or Raspberry Pi projects.",
  "Photosensitive Sensors": "Assorted light-sensitive components for detecting brightness or beam interruption. Identify whether each part is a photoresistor, photodiode, or phototransistor before designing the readout circuit.",
  "RFID Kit": "RC522-style 13.56 MHz RFID reader kit with cards or key fobs for identification and access-control prototypes. It communicates over SPI and uses 3.3 V logic.",
  "RGB Color Sensor with IR Filter": "TCS34725-style RGB color sensor with an infrared-blocking filter and I2C interface. Useful for color matching, light analysis, and object sorting.",
  "Reed Sensor": "Magnetically operated reed switch for door, position, and rotation sensing. It acts like a simple contact and may need debouncing or a pull-up resistor.",
  "SEN-14585 (fingerprint)": "SparkFun fingerprint scanner module for enrolling and matching fingerprints through a serial interface. Store templates on the module and use matches for prototype access control.",
  "Temperature Sensor": "Waterproof thermistor-based temperature probe for contact or liquid measurements. It produces an analog resistance/voltage and requires calibration plus an ADC on Raspberry Pi.",
  "Thin Film Pressure Sensor": "Force-sensitive resistor whose resistance falls as pressure increases. Use a voltage divider for touch or force estimates; it is not a precision load cell.",
  "Tilt Switches": "NKK DSBA1P rolling-ball tilt switch that closes or opens with orientation. Useful for simple level, movement, and tamper detection without an IMU.",
  "Touch Screen": "Touch-enabled display panel for Raspberry Pi user interfaces, dashboards, and kiosks. Confirm the display connector, touch interface, resolution, and required power for the attached model.",
  "Weighing Sensor": "Load or weighing sensor for converting applied force into a small bridge signal. Pair it with a load-cell amplifier/ADC and calibrate it with known weights.",

  "Curved Tweezers EROP7SA-ND": "Curved precision tweezers for placing components, routing wires, and reaching around assemblies. Use the curved tips for access where straight tweezers are awkward.",
  "DMM": "Digital multimeter for checking voltage, resistance, continuity, and current during assembly and debugging. Move the probe lead and select the correct range before current measurements.",
  "Flush Cutters 170MN-ND": "Klein D275-5 flush cutters for trimming component leads, small wire, and cable ties close to a surface. Do not use them on hardened steel or live conductors.",
  "Large Storage box": "Large compartmented storage box for keeping project parts, cables, and hardware together during the event. Return it with the included contents organized.",
  "Needle Nose Pliers 243-1215-ND": "Aven 10314 needle-nose pliers for gripping, bending, and positioning wire or small mechanical parts in tight spaces.",
  "Plastic storage boxes": "Small plastic organizers for keeping components, fasteners, and adapters grouped during a build. Label temporary contents so parts return to the correct inventory bin.",
  "Pointed Tweezers EROPAASA-ND": "Fine pointed precision tweezers for handling small electronic components, jumpers, and hardware. Protect the tips from twisting or prying loads.",
  "Wire Strippers K604-ND": "Jonard JIC-2030 wire stripper for removing insulation from common hookup-wire gauges. Match the conductor to the correct notch to avoid nicking the copper."
};

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:4173").replace(/\/$/, "");
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.CHECKOUT_BASE_URL);
  const username = process.env.CHECKOUT_ADMIN_USERNAME;
  const password = process.env.CHECKOUT_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("Set CHECKOUT_ADMIN_USERNAME and CHECKOUT_ADMIN_PASSWORD before running this script.");
  }

  let cookie = "";
  async function post(body) {
    const response = await fetch(`${baseUrl}/api/checkout`, {
      method: "POST",
      headers: Object.assign(
        { "content-type": "application/json" },
        cookie ? { cookie } : {}
      ),
      body: JSON.stringify(body)
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    const payload = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${payload.error || "Request failed"}`);
    return payload;
  }

  await post({ action: "login", username, password });
  const catalog = await post({ action: "catalog" });
  const missing = catalog.components.filter((component) => !descriptions[component.name]);

  if (missing.length) {
    throw new Error(`No curated description for: ${missing.map((component) => component.name).join(", ")}`);
  }

  let updated = 0;
  for (const component of catalog.components) {
    const description = descriptions[component.name];
    if (component.description === description) continue;

    await post({
      action: "save-component",
      idempotencyKey: crypto.randomUUID(),
      id: component.id,
      expectedVersion: component.version,
      name: component.name,
      description,
      imageUrl: component.imageUrl,
      imageAlt: component.imageAlt,
      category: component.category,
      compatibility: component.compatibility,
      arduinoGuidance: component.arduinoGuidance,
      raspberryPiGuidance: component.raspberryPiGuidance,
      binLocation: component.binLocation,
      technicalSpecs: component.technicalSpecs,
      relationships: component.relationships,
      totalQuantity: component.totalQuantity,
      unavailableQuantity: component.unavailableQuantity,
      protectedStock: component.protectedStock,
      maxActivePerTeam: component.maxActivePerTeam,
      active: component.active,
      adminNotes: component.adminNotes,
      changeReason: "Replaced generic copy with product-specific catalog guidance from inventory links."
    });
    updated += 1;
  }

  process.stdout.write(`Updated ${updated} component descriptions at ${baseUrl}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
