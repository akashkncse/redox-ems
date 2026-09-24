/*
  EMS ESP32 Edge Controller
  Board: ESP32 DevKit V1 / ESP32-WROOM-32, 38-pin

  Fixed hardware wiring:
    INA219 #1 Solar : SDA 21, SCL 22
    DS3231 RTC      : SDA 21, SCL 22

    INA219 #2 BESS  : SDA 16, SCL 17
    INA219 #3 Grid  : SDA 32, SCL 33
    INA219 #4 EV1   : SDA 4,  SCL 5
    INA219 #5 EV2   : SDA 23, SCL 15

    Relay 1 = GPIO 25
    Relay 2 = GPIO 26
    Relay 3 = GPIO 27
    Relay 4 = GPIO 14
    Relay 5 = GPIO 13
    Relay 6 = GPIO 18
    Relay 7 = GPIO 19

  Relay module: ACTIVE HIGH.

  Network:
    ESP32 connects as Wi-Fi STA to the laptop Mobile Hotspot.
    ESP32 POSTs telemetry to:
      http://<LAPTOP_HOTSPOT_IP>:5000/

  Dependencies:
    - ArduinoJson 7
    - ESP32 Arduino core
  Built-in libraries:
    - WiFi.h
    - HTTPClient.h
    - Wire.h

  IMPORTANT:
    1. Verify INA219 shunt resistor/current range before connecting real power.
    2. The default calibration below assumes a 0.1-ohm shunt and 3.2-A
       expected maximum current. Change these values to match the actual
       INA219 boards/shunts.
    3. GPIO 15 is a boot-strapping pin on ESP32. Because the wiring is fixed,
       verify that the board still boots reliably with the EV2 I2C pull-up.
    4. Test this firmware with the power stage disconnected before applying
       real battery/charger power.
*/

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============================================================
// USER CONFIGURATION
// ============================================================

// ---------- Laptop Wi-Fi hotspot ----------
const char* WIFI_SSID     = "EMS_LAPTOP";
const char* WIFI_PASSWORD = "EMS12345678";

// Change this to the IPv4 address shown by ipconfig for the
// Windows Mobile Hotspot adapter.
// Common Windows Mobile Hotspot address is often 192.168.137.1,
// but ALWAYS verify it on your laptop.
IPAddress SERVER_IP(192, 168, 137, 1);
const uint16_t SERVER_PORT = 5000;

// Root endpoint exactly as requested.
const char* API_PATH = "/";

// Send telemetry every 5 seconds.
const uint32_t TELEMETRY_INTERVAL_MS = 5000;

// HTTP timeout.
const uint32_t HTTP_TIMEOUT_MS = 3000;

// ---------- I2C ----------
const uint8_t INA219_ADDRESS = 0x40;
const uint8_t DS3231_ADDRESS = 0x68;

// The INA219 configuration below is designed for the common
// 0.1-ohm shunt board and approximately 3.2 A maximum.
// CHANGE these to match the actual hardware.
const float INA219_SHUNT_OHMS = 0.100f;
const float INA219_MAX_EXPECTED_CURRENT_A = 3.200f;

// ---------- Grid availability ----------
const float GRID_AVAILABLE_THRESHOLD_V = 10.50f;

// ---------- EV presence/status ----------
const float EV_PRESENT_THRESHOLD_V = 1.00f;

// ---------- RTC ----------
// false = trust the battery-backed RTC.
// Set true ONCE if the RTC has never been set, upload, then set false
// and upload again.
const bool SET_RTC_FROM_COMPILE_TIME = false;

// ---------- Relay GPIOs ----------
const uint8_t RELAY_1_PIN = 25;
const uint8_t RELAY_2_PIN = 26;
const uint8_t RELAY_3_PIN = 27;
const uint8_t RELAY_4_PIN = 14;
const uint8_t RELAY_5_PIN = 13;
const uint8_t RELAY_6_PIN = 18;
const uint8_t RELAY_7_PIN = 19;

// Active HIGH relay module.
const uint8_t RELAY_ON  = HIGH;
const uint8_t RELAY_OFF = LOW;

// Relay startup requirement:
// R7, R3 and R4 must be ON immediately after ESP32 starts.
const bool STARTUP_R7_ON = true;
const bool STARTUP_R3_ON = true;
const bool STARTUP_R4_ON = true;

// Break-before-make delay for source switching.
const uint32_t RELAY_SWITCH_DELAY_MS = 150;

// ============================================================
// FIXED I2C BUS IMPLEMENTATION
// ============================================================

class I2CBusInterface {
public:
  virtual bool write16(uint8_t address, uint8_t reg, uint16_t value) = 0;
  virtual bool read16(uint8_t address, uint8_t reg, uint16_t &value) = 0;
  virtual void begin() = 0;
};

// ------------------------------------------------------------
// Hardware Wire backend
// Used for GPIO 21/22.
// ------------------------------------------------------------

class HardwareWireBus : public I2CBusInterface {
private:
  TwoWire* wire;
  uint8_t sdaPin;
  uint8_t sclPin;

public:
  HardwareWireBus(TwoWire* w, uint8_t sda, uint8_t scl)
    : wire(w), sdaPin(sda), sclPin(scl) {}

  void begin() override {
    wire->begin(sdaPin, sclPin);
    wire->setClock(100000);
  }

  bool write16(uint8_t address, uint8_t reg, uint16_t value) override {
    wire->beginTransmission(address);
    wire->write(reg);
    wire->write((uint8_t)(value >> 8));
    wire->write((uint8_t)(value & 0xFF));
    return wire->endTransmission() == 0;
  }

  bool read16(uint8_t address, uint8_t reg, uint16_t &value) override {
    wire->beginTransmission(address);
    wire->write(reg);

    if (wire->endTransmission(false) != 0) {
      return false;
    }

    if (wire->requestFrom((int)address, 2) != 2) {
      return false;
    }

    uint8_t msb = wire->read();
    uint8_t lsb = wire->read();

    value = ((uint16_t)msb << 8) | lsb;
    return true;
  }
};

// ------------------------------------------------------------
// Software I2C backend
// Used for the fixed additional SDA/SCL pairs.
// ------------------------------------------------------------

class SoftwareI2C : public I2CBusInterface {
private:
  uint8_t sdaPin;
  uint8_t sclPin;
  uint16_t halfPeriodUs;

  void sdaHigh() {
    pinMode(sdaPin, INPUT_PULLUP);
  }

  void sdaLow() {
    pinMode(sdaPin, OUTPUT);
    digitalWrite(sdaPin, LOW);
  }

  void sclHigh() {
    pinMode(sclPin, INPUT_PULLUP);

    // Basic clock-stretching support.
    uint32_t start = micros();
    while (digitalRead(sclPin) == LOW) {
      if ((micros() - start) > 1000) {
        break;
      }
    }
  }

  void sclLow() {
    pinMode(sclPin, OUTPUT);
    digitalWrite(sclPin, LOW);
  }

  void delayHalf() {
    delayMicroseconds(halfPeriodUs);
  }

  void startCondition() {
    sdaHigh();
    sclHigh();
    delayHalf();

    sdaLow();
    delayHalf();

    sclLow();
    delayHalf();
  }

  void stopCondition() {
    sdaLow();
    delayHalf();

    sclHigh();
    delayHalf();

    sdaHigh();
    delayHalf();
  }

  bool writeBit(bool bitValue) {
    if (bitValue) {
      sdaHigh();
    } else {
      sdaLow();
    }

    delayHalf();
    sclHigh();
    delayHalf();
    sclLow();
    delayHalf();

    return true;
  }

  bool readBit(bool &bitValue) {
    sdaHigh();
    delayHalf();

    sclHigh();
    delayHalf();

    bitValue = digitalRead(sdaPin) != LOW;

    sclLow();
    delayHalf();

    return true;
  }

  bool writeByte(uint8_t data) {
    for (int i = 7; i >= 0; --i) {
      writeBit((data >> i) & 0x01);
    }

    bool ack = true;
    readBit(ack);

    // ACK is LOW.
    return !ack;
  }

  uint8_t readByte(bool sendAck) {
    uint8_t value = 0;

    for (int i = 7; i >= 0; --i) {
      bool bitValue = false;
      readBit(bitValue);
      if (bitValue) {
        value |= (1U << i);
      }
    }

    // ACK = LOW, NACK = HIGH.
    writeBit(!sendAck);

    return value;
  }

public:
  SoftwareI2C(uint8_t sda, uint8_t scl, uint16_t clockHz = 50000) {
    sdaPin = sda;
    sclPin = scl;

    if (clockHz == 0) {
      clockHz = 50000;
    }

    halfPeriodUs = 500000UL / clockHz;

    if (halfPeriodUs < 2) {
      halfPeriodUs = 2;
    }
  }

  void begin() override {
    sdaHigh();
    sclHigh();
    delay(2);
  }

  bool write16(uint8_t address, uint8_t reg, uint16_t value) override {
    for (int attempt = 0; attempt < 2; ++attempt) {
      startCondition();

      bool ok = true;
      ok &= writeByte((address << 1) | 0x00);
      ok &= writeByte(reg);
      ok &= writeByte((uint8_t)(value >> 8));
      ok &= writeByte((uint8_t)(value & 0xFF));

      stopCondition();

      if (ok) {
        return true;
      }

      delay(1);
    }

    return false;
  }

  bool read16(uint8_t address, uint8_t reg, uint16_t &value) override {
    for (int attempt = 0; attempt < 2; ++attempt) {
      startCondition();

      bool ok = true;
      ok &= writeByte((address << 1) | 0x00);
      ok &= writeByte(reg);

      // Repeated START.
      sdaHigh();
      sclHigh();
      delayHalf();
      sdaLow();
      delayHalf();
      sclLow();
      delayHalf();

      ok &= writeByte((address << 1) | 0x01);

      if (!ok) {
        stopCondition();
        delay(1);
        continue;
      }

      uint8_t msb = readByte(true);
      uint8_t lsb = readByte(false);

      stopCondition();

      value = ((uint16_t)msb << 8) | lsb;
      return true;
    }

    return false;
  }
};

// ============================================================
// INA219 DRIVER
// ============================================================

class INA219Sensor {
private:
  I2CBusInterface* bus;
  uint8_t address;

  float currentLSB_A;
  float shuntOhms;
  float maxCurrentA;

public:
  INA219Sensor()
    : bus(nullptr),
      address(0x40),
      currentLSB_A(0.0001f),
      shuntOhms(0.1f),
      maxCurrentA(3.2f) {}

  void attach(I2CBusInterface* b, uint8_t addr) {
    bus = b;
    address = addr;
  }

  bool begin(float shuntResistanceOhms, float maxExpectedCurrentA) {
    if (bus == nullptr) {
      return false;
    }

    shuntOhms = shuntResistanceOhms;
    maxCurrentA = maxExpectedCurrentA;

    // Current_LSB = MaxExpectedCurrent / 32768
    currentLSB_A = maxCurrentA / 32768.0f;

    // INA219 calibration:
    // CAL = 0.04096 / (Current_LSB * Rshunt)
    float calibrationFloat =
      0.04096f / (currentLSB_A * shuntOhms);

    if (calibrationFloat < 1.0f || calibrationFloat > 65535.0f) {
      Serial.println("INA219 calibration value outside 16-bit range.");
      return false;
    }

    uint16_t calibration = (uint16_t)calibrationFloat;

    // 0x399F:
    // BRNG = 32 V
    // PGA = +/-320 mV
    // BADC = 12-bit, 1 sample
    // SADC = 12-bit, 1 sample
    // MODE = continuous shunt + bus
    if (!bus->write16(address, 0x00, 0x399F)) {
      return false;
    }

    if (!bus->write16(address, 0x05, calibration)) {
      return false;
    }

    delay(10);

    uint16_t configCheck = 0;
    if (!bus->read16(address, 0x00, configCheck)) {
      return false;
    }

    Serial.print("INA219 0x");
    Serial.print(address, HEX);
    Serial.print(" calibration=");
    Serial.println(calibration);

    return true;
  }

  bool readVoltage(float &voltageV) {
    uint16_t raw = 0;

    if (!bus->read16(address, 0x02, raw)) {
      return false;
    }

    // INA219 bus voltage is right-shifted by 3 bits.
    uint16_t busRaw = raw >> 3;
    voltageV = busRaw * 0.004f;

    return true;
  }

  bool readCurrent(float &currentA) {
    uint16_t rawUnsigned = 0;

    if (!bus->read16(address, 0x04, rawUnsigned)) {
      return false;
    }

    int16_t rawSigned = (int16_t)rawUnsigned;
    currentA = rawSigned * currentLSB_A;

    return true;
  }

  bool read(float &voltageV, float &currentA, float &powerW) {
    if (!readVoltage(voltageV)) {
      return false;
    }

    if (!readCurrent(currentA)) {
      return false;
    }

    // Requirement: power = voltage x current.
    powerW = voltageV * currentA;

    return true;
  }
};

// ============================================================
// DS3231 RTC
// ============================================================

struct DateTimeData {
  int year;
  int month;
  int day;
  int hour;
  int minute;
  int second;
};

uint8_t bcdToDec(uint8_t bcd) {
  return ((bcd >> 4) * 10) + (bcd & 0x0F);
}

uint8_t decToBcd(uint8_t dec) {
  return ((dec / 10) << 4) | (dec % 10);
}

bool rtcWriteRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(DS3231_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool rtcReadRegisters(uint8_t startReg, uint8_t* buffer, size_t count) {
  Wire.beginTransmission(DS3231_ADDRESS);
  Wire.write(startReg);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom((int)DS3231_ADDRESS, (int)count) != (int)count) {
    return false;
  }

  for (size_t i = 0; i < count; ++i) {
    buffer[i] = Wire.read();
  }

  return true;
}

bool rtcRead(DateTimeData &dt) {
  uint8_t data[7];

  if (!rtcReadRegisters(0x00, data, 7)) {
    return false;
  }

  dt.second = bcdToDec(data[0] & 0x7F);
  dt.minute = bcdToDec(data[1] & 0x7F);
  dt.hour   = bcdToDec(data[2] & 0x3F);
  dt.day    = bcdToDec(data[4] & 0x3F);
  dt.month  = bcdToDec(data[5] & 0x1F);
  dt.year   = 2000 + bcdToDec(data[6]);

  return true;
}

bool rtcSet(const DateTimeData &dt) {
  Wire.beginTransmission(DS3231_ADDRESS);
  Wire.write(0x00);

  Wire.write(decToBcd(dt.second));
  Wire.write(decToBcd(dt.minute));
  Wire.write(decToBcd(dt.hour));

  // Day of week. 1 is Sunday. It is not used by the telemetry payload.
  Wire.write(1);

  Wire.write(decToBcd(dt.day));
  Wire.write(decToBcd(dt.month));
  Wire.write(decToBcd(dt.year - 2000));

  return Wire.endTransmission() == 0;
}

bool rtcIsValid() {
  uint8_t status = 0;

  if (!rtcReadRegisters(0x0F, &status, 1)) {
    return false;
  }

  // OSF bit = oscillator stop flag.
  return (status & 0x80) == 0;
}

void rtcClearOscillatorStopFlag() {
  uint8_t status = 0;

  if (!rtcReadRegisters(0x0F, &status, 1)) {
    return;
  }

  status &= ~(0x80);
  rtcWriteRegister(0x0F, status);
}

DateTimeData compileDateTime() {
  DateTimeData dt;

  char monthText[4];
  int day;
  int year;
  int hour;
  int minute;
  int second;

  sscanf(__DATE__, "%3s %d %d", monthText, &day, &year);
  sscanf(__TIME__, "%d:%d:%d", &hour, &minute, &second);

  const char* months = "JanFebMarAprMayJunJulAugSepOctNovDec";
  const char* p = strstr(months, monthText);

  int month = 1;

  if (p != nullptr) {
    month = ((p - months) / 3) + 1;
  }

  dt.year = year;
  dt.month = month;
  dt.day = day;
  dt.hour = hour;
  dt.minute = minute;
  dt.second = second;

  return dt;
}

String formatDateTime(const DateTimeData &dt) {
  char buffer[32];

  snprintf(
    buffer,
    sizeof(buffer),
    "%04d-%02d-%02dT%02d:%02d:%02d",
    dt.year,
    dt.month,
    dt.day,
    dt.hour,
    dt.minute,
    dt.second
  );

  return String(buffer);
}

// ============================================================
// HARDWARE OBJECTS
// ============================================================

// Hardware I2C: Solar INA219 + DS3231.
HardwareWireBus busSolar(&Wire, 21, 22);

// Four additional fixed buses using software I2C.
SoftwareI2C busBess(16, 17, 50000);
SoftwareI2C busGrid(32, 33, 50000);
SoftwareI2C busEV1(4, 5, 50000);
SoftwareI2C busEV2(23, 15, 50000);

INA219Sensor solarINA;
INA219Sensor bessINA;
INA219Sensor gridINA;
INA219Sensor ev1INA;
INA219Sensor ev2INA;

// ============================================================
// TELEMETRY DATA
// ============================================================

struct SensorData {
  float solarVoltage;
  float solarCurrent;
  float solarPower;

  float bessVoltage;
  float bessCurrent;
  float bessPower;
  int bessSOC;

  float gridVoltage;
  float gridCurrent;
  float gridPower;
  bool gridAvailable;

  float ev1Voltage;
  float ev1Current;
  float ev1Power;
  bool ev1Active;

  float ev2Voltage;
  float ev2Current;
  float ev2Power;
  bool ev2Active;

  DateTimeData rtc;
};

// ============================================================
// BESS SOC
// ============================================================

struct SocPoint {
  float voltage;
  int soc;
};

const SocPoint SOC_TABLE[] = {
  {12.60f, 100},
  {12.45f,  95},
  {12.30f,  90},
  {12.15f,  80},
  {12.00f,  70},
  {11.85f,  60},
  {11.70f,  50},
  {11.55f,  40},
  {11.40f,  30},
  {11.25f,  20},
  {11.10f,  10},
  {10.80f,   0}
};

const size_t SOC_TABLE_SIZE =
  sizeof(SOC_TABLE) / sizeof(SOC_TABLE[0]);

int calculateSOC(float voltage) {
  // 9.00 - 10.80 V = 0%.
  if (voltage <= 10.80f) {
    return 0;
  }

  if (voltage >= 12.60f) {
    return 100;
  }

  for (size_t i = 0; i < SOC_TABLE_SIZE - 1; ++i) {
    const SocPoint &high = SOC_TABLE[i];
    const SocPoint &low  = SOC_TABLE[i + 1];

    if (voltage <= high.voltage && voltage >= low.voltage) {
      float ratio =
        (voltage - low.voltage) /
        (high.voltage - low.voltage);

      float soc =
        low.soc +
        ratio * (high.soc - low.soc);

      int roundedSOC = (int)lround(soc);

      if (roundedSOC < 0) {
        roundedSOC = 0;
      }

      if (roundedSOC > 100) {
        roundedSOC = 100;
      }

      return roundedSOC;
    }
  }

  return 0;
}

// ============================================================
// RELAY CONTROL
// ============================================================

enum Source {
  SOURCE_NONE    = 0,
  SOURCE_BATTERY = 1,
  SOURCE_SOLAR   = 2,
  SOURCE_GRID    = 3
};

struct EmsCommand {
  bool ev1Charge;
  bool ev2Charge;
  int ev1Source;
  int ev2Source;
};

EmsCommand lastCommand = {
  false,
  false,
  SOURCE_NONE,
  SOURCE_NONE
};

void relayWrite(uint8_t pin, bool on) {
  digitalWrite(pin, on ? RELAY_ON : RELAY_OFF);
}

void allRelaysOff() {
  relayWrite(RELAY_1_PIN, false);
  relayWrite(RELAY_2_PIN, false);
  relayWrite(RELAY_3_PIN, false);
  relayWrite(RELAY_4_PIN, false);
  relayWrite(RELAY_5_PIN, false);
  relayWrite(RELAY_6_PIN, false);
  relayWrite(RELAY_7_PIN, false);
}

void startupRelayState() {
  // Explicitly force all relays off first.
  allRelaysOff();

  delay(50);

  // Required startup state.
  if (STARTUP_R7_ON) {
    relayWrite(RELAY_7_PIN, true);
  }

  if (STARTUP_R3_ON) {
    relayWrite(RELAY_3_PIN, true);
  }

  if (STARTUP_R4_ON) {
    relayWrite(RELAY_4_PIN, true);
  }

  Serial.println("Startup relay state: R7=ON, R3=ON, R4=ON");
}

bool isValidSource(int source) {
  return source == SOURCE_BATTERY ||
         source == SOURCE_SOLAR ||
         source == SOURCE_GRID;
}

bool validateCommand(
  const EmsCommand &cmd,
  const SensorData &data,
  String &reason
) {
  if (cmd.ev1Charge && !isValidSource(cmd.ev1Source)) {
    reason = "Invalid EV1 source";
    return false;
  }

  if (cmd.ev2Charge && !isValidSource(cmd.ev2Source)) {
    reason = "Invalid EV2 source";
    return false;
  }

  bool batteryRequired =
    (cmd.ev1Charge && cmd.ev1Source == SOURCE_BATTERY) ||
    (cmd.ev2Charge && cmd.ev2Source == SOURCE_BATTERY);

  bool solarRequired =
    (cmd.ev1Charge && cmd.ev1Source == SOURCE_SOLAR) ||
    (cmd.ev2Charge && cmd.ev2Source == SOURCE_SOLAR);

  // R6 and R7 are a shared upstream source selector.
  // They cannot safely select battery and solar at the same time.
  if (batteryRequired && solarRequired) {
    reason =
      "Invalid command: EV1/EV2 request battery and solar simultaneously; "
      "shared R6/R7 source path cannot provide both.";
    return false;
  }

  bool gridRequired =
    (cmd.ev1Charge && cmd.ev1Source == SOURCE_GRID) ||
    (cmd.ev2Charge && cmd.ev2Source == SOURCE_GRID);

  if (gridRequired && !data.gridAvailable) {
    reason =
      "Invalid command: grid requested but grid voltage is unavailable.";
    return false;
  }

  return true;
}

void applyEmsCommand(
  const EmsCommand &cmd,
  const SensorData &data
) {
  String reason;

  if (!validateCommand(cmd, data, reason)) {
    Serial.print("COMMAND REJECTED: ");
    Serial.println(reason);

    // Do not modify the existing relay state when a command is invalid.
    return;
  }

  bool needBattery =
    (cmd.ev1Charge && cmd.ev1Source == SOURCE_BATTERY) ||
    (cmd.ev2Charge && cmd.ev2Source == SOURCE_BATTERY);

  bool needSolar =
    (cmd.ev1Charge && cmd.ev1Source == SOURCE_SOLAR) ||
    (cmd.ev2Charge && cmd.ev2Source == SOURCE_SOLAR);

  bool needGrid =
    (cmd.ev1Charge && cmd.ev1Source == SOURCE_GRID) ||
    (cmd.ev2Charge && cmd.ev2Source == SOURCE_GRID);

  // ----------------------------------------------------------
  // BREAK-BEFORE-MAKE
  // Prevent source overlap while changing paths.
  // ----------------------------------------------------------
  allRelaysOff();
  delay(RELAY_SWITCH_DELAY_MS);

  // ----------------------------------------------------------
  // Shared upstream source selection.
  //
  // R7 ON = Solar source
  // R6 ON = Battery source
  //
  // They are mutually exclusive.
  // ----------------------------------------------------------

  if (needSolar) {
    relayWrite(RELAY_7_PIN, true);
  } else if (needBattery) {
    relayWrite(RELAY_6_PIN, true);
  }

  delay(RELAY_SWITCH_DELAY_MS);

  // ----------------------------------------------------------
  // Grid path.
  //
  // R5 supplies the NO/Grid input of R3 and R4.
  // Therefore R5 must be ON before R3/R4 are switched to grid.
  // ----------------------------------------------------------

  if (needGrid) {
    relayWrite(RELAY_5_PIN, true);
    delay(RELAY_SWITCH_DELAY_MS);
  }

  // ----------------------------------------------------------
  // EV1 source routing.
  //
  // R3 ON  = EV1 -> Grid
  // R3 OFF = EV1 -> R1
  //
  // R1 ON  = Solar
  // R1 OFF = Battery
  // ----------------------------------------------------------

  if (cmd.ev1Charge) {
    if (cmd.ev1Source == SOURCE_GRID) {
      relayWrite(RELAY_3_PIN, true);
    } else {
      relayWrite(RELAY_1_PIN, cmd.ev1Source == SOURCE_SOLAR);
      delay(50);
      relayWrite(RELAY_3_PIN, false);
    }
  }

  // ----------------------------------------------------------
  // EV2 source routing.
  //
  // R4 ON  = EV2 -> Grid
  // R4 OFF = EV2 -> R2
  //
  // R2 ON  = Solar
  // R2 OFF = Battery
  // ----------------------------------------------------------

  if (cmd.ev2Charge) {
    if (cmd.ev2Source == SOURCE_GRID) {
      relayWrite(RELAY_4_PIN, true);
    } else {
      relayWrite(RELAY_2_PIN, cmd.ev2Source == SOURCE_SOLAR);
      delay(50);
      relayWrite(RELAY_4_PIN, false);
    }
  }

  Serial.println("COMMAND APPLIED");

  Serial.print("EV1 charge=");
  Serial.print(cmd.ev1Charge);
  Serial.print(" source=");
  Serial.println(cmd.ev1Source);

  Serial.print("EV2 charge=");
  Serial.print(cmd.ev2Charge);
  Serial.print(" source=");
  Serial.println(cmd.ev2Source);

  Serial.print("Relays: ");
  Serial.print("R1="); Serial.print(digitalRead(RELAY_1_PIN));
  Serial.print(" R2="); Serial.print(digitalRead(RELAY_2_PIN));
  Serial.print(" R3="); Serial.print(digitalRead(RELAY_3_PIN));
  Serial.print(" R4="); Serial.print(digitalRead(RELAY_4_PIN));
  Serial.print(" R5="); Serial.print(digitalRead(RELAY_5_PIN));
  Serial.print(" R6="); Serial.print(digitalRead(RELAY_6_PIN));
  Serial.print(" R7="); Serial.println(digitalRead(RELAY_7_PIN));
}

// ============================================================
// SENSOR READING
// ============================================================

bool readAllSensors(SensorData &data) {
  bool ok = true;

  if (!solarINA.read(
        data.solarVoltage,
        data.solarCurrent,
        data.solarPower)) {
    Serial.println("ERROR: Solar INA219 read failed");
    ok = false;
  }

  if (!bessINA.read(
        data.bessVoltage,
        data.bessCurrent,
        data.bessPower)) {
    Serial.println("ERROR: BESS INA219 read failed");
    ok = false;
  }

  if (!gridINA.read(
        data.gridVoltage,
        data.gridCurrent,
        data.gridPower)) {
    Serial.println("ERROR: Grid INA219 read failed");
    ok = false;
  }

  if (!ev1INA.read(
        data.ev1Voltage,
        data.ev1Current,
        data.ev1Power)) {
    Serial.println("ERROR: EV1 INA219 read failed");
    ok = false;
  }

  if (!ev2INA.read(
        data.ev2Voltage,
        data.ev2Current,
        data.ev2Power)) {
    Serial.println("ERROR: EV2 INA219 read failed");
    ok = false;
  }

  data.bessSOC = calculateSOC(data.bessVoltage);

  data.gridAvailable =
    data.gridVoltage >= GRID_AVAILABLE_THRESHOLD_V;

  data.ev1Active =
    data.ev1Voltage >= EV_PRESENT_THRESHOLD_V;

  data.ev2Active =
    data.ev2Voltage >= EV_PRESENT_THRESHOLD_V;

  if (!rtcRead(data.rtc)) {
    Serial.println("ERROR: DS3231 read failed");
    ok = false;
  }

  return ok;
}

// ============================================================
// JSON TELEMETRY
// ============================================================

String buildTelemetryJson(const SensorData &data) {
  JsonDocument doc;

  doc["time"] = formatDateTime(data.rtc);

  // Java DTO contains Long, so send integer watts.
  doc["solar_power"] = (long)lround(data.solarPower);
  doc["bess_power"]  = (long)lround(data.bessPower);
  doc["grid_power"]  = (long)lround(data.gridPower);
  doc["ev1_power"]   = (long)lround(data.ev1Power);
  doc["ev2_power"]   = (long)lround(data.ev2Power);

  doc["grid"] = data.gridAvailable;
  doc["ev1"]  = data.ev1Active;
  doc["ev2"]  = data.ev2Active;

  String output;
  serializeJson(doc, output);

  return output;
}

// ============================================================
// HTTP
// ============================================================

String buildServerUrl() {
  String url = "http://";
  url += SERVER_IP.toString();
  url += ":";
  url += String(SERVER_PORT);
  url += API_PATH;

  return url;
}

bool parseEmsCommand(
  const String &response,
  EmsCommand &command
) {
  JsonDocument doc;

  DeserializationError error =
    deserializeJson(doc, response);

  if (error) {
    Serial.print("JSON response parse error: ");
    Serial.println(error.c_str());
    return false;
  }

  if (!doc["ev1_charge"].is<bool>() ||
      !doc["ev2_charge"].is<bool>() ||
      !doc["ev1_source"].is<int>() ||
      !doc["ev2_source"].is<int>()) {
    Serial.println("JSON response is missing one or more command fields.");
    return false;
  }

  command.ev1Charge = doc["ev1_charge"].as<bool>();
  command.ev2Charge = doc["ev2_charge"].as<bool>();
  command.ev1Source = doc["ev1_source"].as<int>();
  command.ev2Source = doc["ev2_source"].as<int>();

  return true;
}

bool postTelemetry(
  const String &telemetryJson,
  const SensorData &data
) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("HTTP skipped: Wi-Fi not connected.");
    return false;
  }

  HTTPClient http;
  WiFiClient client;

  String url = buildServerUrl();

  Serial.print("POST ");
  Serial.println(url);

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin failed.");
    return false;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");

  int httpCode =
    http.POST(telemetryJson);

  if (httpCode <= 0) {
    Serial.print("HTTP request failed: ");
    Serial.println(http.errorToString(httpCode));
    http.end();
    return false;
  }

  Serial.print("HTTP status: ");
  Serial.println(httpCode);

  String response = http.getString();

  Serial.print("Response: ");
  Serial.println(response);

  bool success = false;

  if (httpCode >= 200 && httpCode < 300) {
    EmsCommand newCommand;

    if (parseEmsCommand(response, newCommand)) {
      lastCommand = newCommand;

      applyEmsCommand(lastCommand, data);

      success = true;
    } else {
      Serial.println("No valid EMS command applied.");
    }
  } else {
    Serial.println("Server returned a non-success HTTP status.");
  }

  http.end();

  return success;
}

// ============================================================
// WIFI
// ============================================================

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connected.");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("Laptop server: ");
    Serial.println(buildServerUrl());
  } else {
    Serial.println("Wi-Fi connection failed.");
  }
}

// ============================================================
// SERIAL SENSOR DEBUG
// ============================================================

void printSensorData(const SensorData &data) {
  Serial.println();
  Serial.println("========== SENSOR DATA ==========");

  Serial.print("Time       : ");
  Serial.println(formatDateTime(data.rtc));

  Serial.print("Solar V    : ");
  Serial.print(data.solarVoltage, 3);
  Serial.print(" V, I = ");
  Serial.print(data.solarCurrent, 3);
  Serial.print(" A, P = ");
  Serial.print(data.solarPower, 3);
  Serial.println(" W");

  Serial.print("BESS V     : ");
  Serial.print(data.bessVoltage, 3);
  Serial.print(" V, I = ");
  Serial.print(data.bessCurrent, 3);
  Serial.print(" A, P = ");
  Serial.print(data.bessPower, 3);
  Serial.print(" W, SOC = ");
  Serial.print(data.bessSOC);
  Serial.println("%");

  Serial.print("Grid V     : ");
  Serial.print(data.gridVoltage, 3);
  Serial.print(" V, I = ");
  Serial.print(data.gridCurrent, 3);
  Serial.print(" A, P = ");
  Serial.print(data.gridPower, 3);
  Serial.print(" W, Available = ");
  Serial.println(data.gridAvailable ? "YES" : "NO");

  Serial.print("EV1 V      : ");
  Serial.print(data.ev1Voltage, 3);
  Serial.print(" V, I = ");
  Serial.print(data.ev1Current, 3);
  Serial.print(" A, P = ");
  Serial.print(data.ev1Power, 3);
  Serial.print(" W, Active = ");
  Serial.println(data.ev1Active ? "YES" : "NO");

  Serial.print("EV2 V      : ");
  Serial.print(data.ev2Voltage, 3);
  Serial.print(" V, I = ");
  Serial.print(data.ev2Current, 3);
  Serial.print(" A, P = ");
  Serial.print(data.ev2Power, 3);
  Serial.print(" W, Active = ");
  Serial.println(data.ev2Active ? "YES" : "NO");

  Serial.println("=================================");
}

// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==========================================");
  Serial.println("ESP32 EMS EDGE CONTROLLER");
  Serial.println("==========================================");

  // ----------------------------------------------------------
  // Relay GPIO setup FIRST.
  // ----------------------------------------------------------

  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  pinMode(RELAY_3_PIN, OUTPUT);
  pinMode(RELAY_4_PIN, OUTPUT);
  pinMode(RELAY_5_PIN, OUTPUT);
  pinMode(RELAY_6_PIN, OUTPUT);
  pinMode(RELAY_7_PIN, OUTPUT);

  startupRelayState();

  // ----------------------------------------------------------
  // I2C setup.
  // ----------------------------------------------------------

  Serial.println("Initializing I2C buses...");

  busSolar.begin();
  busBess.begin();
  busGrid.begin();
  busEV1.begin();
  busEV2.begin();

  // ----------------------------------------------------------
  // INA219 setup.
  // ----------------------------------------------------------

  solarINA.attach(&busSolar, INA219_ADDRESS);
  bessINA.attach(&busBess, INA219_ADDRESS);
  gridINA.attach(&busGrid, INA219_ADDRESS);
  ev1INA.attach(&busEV1, INA219_ADDRESS);
  ev2INA.attach(&busEV2, INA219_ADDRESS);

  bool solarOK =
    solarINA.begin(
      INA219_SHUNT_OHMS,
      INA219_MAX_EXPECTED_CURRENT_A);

  bool bessOK =
    bessINA.begin(
      INA219_SHUNT_OHMS,
      INA219_MAX_EXPECTED_CURRENT_A);

  bool gridOK =
    gridINA.begin(
      INA219_SHUNT_OHMS,
      INA219_MAX_EXPECTED_CURRENT_A);

  bool ev1OK =
    ev1INA.begin(
      INA219_SHUNT_OHMS,
      INA219_MAX_EXPECTED_CURRENT_A);

  bool ev2OK =
    ev2INA.begin(
      INA219_SHUNT_OHMS,
      INA219_MAX_EXPECTED_CURRENT_A);

  Serial.print("Solar INA219: ");
  Serial.println(solarOK ? "OK" : "FAILED");

  Serial.print("BESS INA219: ");
  Serial.println(bessOK ? "OK" : "FAILED");

  Serial.print("Grid INA219: ");
  Serial.println(gridOK ? "OK" : "FAILED");

  Serial.print("EV1 INA219: ");
  Serial.println(ev1OK ? "OK" : "FAILED");

  Serial.print("EV2 INA219: ");
  Serial.println(ev2OK ? "OK" : "FAILED");

  // ----------------------------------------------------------
  // RTC.
  // ----------------------------------------------------------

  if (SET_RTC_FROM_COMPILE_TIME) {
    DateTimeData compileDT = compileDateTime();

    if (rtcSet(compileDT)) {
      Serial.print("RTC set to compile time: ");
      Serial.println(formatDateTime(compileDT));
      rtcClearOscillatorStopFlag();
    } else {
      Serial.println("ERROR: Could not set RTC.");
    }
  }

  if (rtcIsValid()) {
    Serial.println("RTC oscillator status: OK");
  } else {
    Serial.println(
      "WARNING: RTC oscillator-stop flag is set. "
      "Set RTC time if required.");
  }

  // ----------------------------------------------------------
  // Wi-Fi.
  // ----------------------------------------------------------

  connectWiFi();

  Serial.println();
  Serial.println("Setup complete.");
  Serial.println("Waiting for telemetry cycle...");
}

// ============================================================
// LOOP
// ============================================================

void loop() {
  static uint32_t lastTelemetryTime = 0;

  // Reconnect if necessary.
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (millis() - lastTelemetryTime <
      TELEMETRY_INTERVAL_MS) {
    delay(20);
    return;
  }

  lastTelemetryTime = millis();

  SensorData data{};

  bool sensorOK = readAllSensors(data);

  printSensorData(data);

  String telemetryJson =
    buildTelemetryJson(data);

  Serial.print("Telemetry JSON: ");
  Serial.println(telemetryJson);

  if (!sensorOK) {
    Serial.println(
      "WARNING: One or more sensor reads failed. "
      "Telemetry will still be sent with available values.");
  }

  postTelemetry(telemetryJson, data);

  Serial.println();
  Serial.println("Next cycle...");
}
