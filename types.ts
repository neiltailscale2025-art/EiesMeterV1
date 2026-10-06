export interface RegisterDefinition {
  address: number;
  hexAddress: string;
  name: string;
  unit: string;
  description: string;
  functionCode: '04H' | '03H' | '10H';
  dataType: 'Float32' | 'ULONG' | 'LONG' | 'UINT' | 'INT' | 'HEX';
  multiplier?: number;
  category: 'instantaneous' | 'demand' | 'energy' | 'setting' | 'device';
  readOnly: boolean;
}

export enum ConnectionType {
  RTU = 'RTU',
  TCP = 'TCP'
}

export interface SerialConfig {
  port: string;
  baudRate: number;
  parity: 'N' | 'E' | 'O';
  stopBits: number;
  byteSize: number;
  slaveId: number;
  readInterval: number; // in seconds
  includeDemand: boolean;
  scriptType: 'async' | 'sync' | 'pyserial';
}

export interface TuyaMeterConfig {
  deviceId: string;
  localKey: string;
  ipAddress: string;
  protocolVersion: '3.3' | '3.4' | '3.5' | '3.1' | 'auto';
  model: 'auto' | 'pj1203a' | 'tongou' | 'switch_dual' | 'custom';
  pollInterval: number; // in seconds
  listenPush: boolean;
  csvPath: string;
  channel1Name: string;
  channel2Name: string;
  // Custom DP overrides
  dpV1?: number;
  dpI1?: number;
  dpP1?: number;
  dpE1?: number;
  dpV2?: number;
  dpI2?: number;
  dpP2?: number;
  dpE2?: number;
  dpFreq?: number;
  dpTotalP?: number;
  scaleV?: number;
  scaleI?: number;
  scaleP?: number;
  // MQTT settings
  enableMqtt: boolean;
  mqttBroker: string;
  mqttPort: number;
  mqttTopic: string;
  mqttUser?: string;
  mqttPass?: string;
  haDiscovery: boolean;
}

export interface RawCsvRow {
  Timestamp: string;
  'Phase 1 Voltage (V)': string;
  'Phase 2 Voltage (V)': string;
  'Phase 3 Voltage (V)': string;
  'Phase 1 Current (A)': string;
  'Phase 2 Current (A)': string;
  'Phase 3 Current (A)': string;
  'Phase 1 Power (W)': string;
  'Phase 2 Power (W)': string;
  'Phase 3 Power (W)': string;
  'Frequency (Hz)': string;
  'Total Active Power (W)': string;
  'Total Apparent Power (VA)': string;
  [key: string]: string;
}

export interface ComputedMeterPoint {
  timestamp: string;
  fullTimestamp: string;
  // 3-Phase Voltages
  v1: number;
  v2: number;
  v3: number;
  vAvg: number;
  // 3-Phase Currents
  i1: number;
  i2: number;
  i3: number;
  iTotal: number;
  // 3-Phase Powers
  p1: number;
  p2: number;
  p3: number;
  totalActiveW: number;
  totalApparentVA: number;
  totalReactiveVar: number;
  powerFactor: number;
  frequency: number;
  // Computed Energy
  deltaKwh: number;
  cumulativeKwh: number;
}
