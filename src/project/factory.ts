import {
  CURRENT_SCHEMA_VERSION,
  type ProjectFile,
  type Scenario,
  type Service,
  type Vehicle,
} from './schema'

/** 新規作成時に必要な、画面の初期値（public/data/defaults.json から渡す） */
export type ProjectDefaults = {
  catchmentM: number
  maxLoadFactor: number
  rampUpFactor: number
  fareElasticity: number
}

export type NewProjectInput = {
  name: string
  prefCode: string
  cityCode: string | null
  municipalityName: string
  startFiscalYear: number
  years: number
}

export function newId(): string {
  return crypto.randomUUID()
}

/** カスタム車両（すべて手入力。値は空欄＝要入力） */
export function emptyVehicle(): Vehicle {
  return {
    presetId: 'custom',
    name: 'カスタム',
    capacity: null,
    seats: null,
    standingAllowed: null,
    operatorOnBoard: null,
    operatorCount: null,
    maxSpeedKmh: null,
    avgSpeedKmh: null,
    rangeKm: null,
    chargeHours: null,
    wheelchair: null,
    autonomyLevel: null,
    sources: {},
  }
}

function emptyService(defaults: ProjectDefaults): Service {
  return {
    weekdayTrips: 0,
    holidayTrips: 0,
    serviceStart: null,
    serviceEnd: null,
    yearEndSuspended: false,
    weekdayDaysOverride: null,
    holidayDaysOverride: null,
    vehicle: emptyVehicle(),
    vehicles: 1,
    spareVehicles: 0,
    maxLoadFactor: defaults.maxLoadFactor,
    tripMinutesOverride: null,
  }
}

export function createScenario(name: string, defaults: ProjectDefaults): Scenario {
  return {
    id: newId(),
    name,
    type: 'base',
    derivedFrom: null,
    stops: [],
    route: { loop: false, segments: [], lengthOverrideKm: null },
    service: emptyService(defaults),
    fare: {
      system: '実施運賃',
      type: 'flat',
      flatFare: 0,
      baseFare: 0,
      ratePerKm: 0,
      rounding: 'round10',
      tableOverrides: [],
      categories: [{ name: '一般（割引なし）', share: 1, discount: 0 }],
      avgRideKmOverride: null,
    },
    coefficients: {
      cityTypeOverride: null,
      overrides: [],
      rampUp: [],
      rampUpSource: null,
      fareElasticity: defaults.fareElasticity,
      fareElasticitySource: null,
      referenceFare: null,
      serviceFactor: 1,
      serviceFactorSource: null,
      routeCaptureOverride: null,
    },
    areaPopulationAdjustPctPerYear: 0,
    developments: [],
    facilityDemand: [],
    otherRevenue: [],
    subsidies: [],
  }
}

export function createProject(input: NewProjectInput, defaults: ProjectDefaults): ProjectFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    toolVersion: __APP_VERSION__,
    savedAt: new Date().toISOString(),
    project: {
      name: input.name,
      municipality: {
        prefCode: input.prefCode,
        cityCode: input.cityCode,
        name: input.municipalityName,
      },
      startFiscalYear: input.startFiscalYear,
      years: input.years,
    },
    dataVersions: {},
    scenarios: [createScenario('標準', defaults)],
    userVehiclePresets: [],
    userReferenceData: [],
    costs: null,
  }
}

/** シナリオの複製（IDを振り直し、名前に「のコピー」を付ける。F-1-2） */
export function duplicateScenario(s: Scenario, name = `${s.name}のコピー`): Scenario {
  const copy = structuredClone(s)
  return { ...copy, id: newId(), name, type: 'custom', derivedFrom: null }
}

/** 年度の初期値：今日の日付から見た翌年度（4月始まり） */
export function nextFiscalYear(today: Date): number {
  const fy = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return fy + 1
}
