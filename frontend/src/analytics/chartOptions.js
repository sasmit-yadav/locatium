import { colors } from '../design-system/tokens';

const axis = colors.text.secondary;
const split = colors.border.subtle;
const accent = colors.accent.default;
const cat = colors.dataCategorical;

function axisLabel() {
  return { color: axis, fontSize: 11 };
}

function axisLine() {
  return { lineStyle: { color: split } };
}

export function scoreRadarOption(scores = {}) {
  return {
    backgroundColor: 'transparent',
    radar: {
      radius: '62%',
      axisName: { color: axis, fontSize: 11 },
      splitLine: { lineStyle: { color: split } },
      splitArea: { areaStyle: { color: [colors.accent.subtle, colors.surface.sunken] } },
      axisLine: axisLine(),
      indicator: [
        { name: 'Infra', max: 100 },
        { name: 'Access', max: 100 },
        { name: 'Risk', max: 100 },
        { name: 'Zone', max: 100 },
      ],
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: [
              scores.infrastructure || 0,
              scores.accessibility || 0,
              scores.environmentalRisk || 0,
              scores.zoneCompatibility || 0,
            ],
            areaStyle: { color: 'rgba(37, 99, 235, 0.18)' },
            lineStyle: { color: accent, width: 2 },
            itemStyle: { color: accent },
          },
        ],
      },
    ],
  };
}

export function facilityBarOption(details = {}) {
  const infrastructure = details.infrastructure?.metrics || {};
  const values = [
    infrastructure.hospitals || 0,
    infrastructure.schools || 0,
    infrastructure.governmentOffices || 0,
  ];
  return {
    backgroundColor: 'transparent',
    grid: { left: 28, right: 8, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ['Hospitals', 'Schools', 'Offices'],
      axisLabel: axisLabel(),
      axisLine: axisLine(),
    },
    yAxis: {
      type: 'value',
      axisLabel: axisLabel(),
      splitLine: { lineStyle: { color: split } },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: 18,
        itemStyle: { color: accent, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

export function infrastructureHeatmapOption(details = {}) {
  const infrastructure = details.infrastructure?.metrics || {};
  const transport = details.transport || {};
  const utilities = details.utilities || {};
  const rows = [
    ['Hospitals', infrastructure.hospitals || 0],
    ['Schools', infrastructure.schools || 0],
    ['Govt offices', infrastructure.governmentOffices || 0],
    ['Water lines', utilities.waterLinesWithin2Km || 0],
    ['Electric assets', utilities.electricAssetsWithin2Km || 0],
    ['Roads', transport.roadsWithin3Km || 0],
  ];
  const max = Math.max(...rows.map(([, value]) => Number(value) || 0), 1);

  return {
    backgroundColor: 'transparent',
    grid: { left: 96, right: 20, top: 18, bottom: 28 },
    xAxis: {
      type: 'category',
      data: ['Density'],
      axisLabel: axisLabel(),
      axisLine: axisLine(),
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: rows.map(([label]) => label),
      axisLabel: axisLabel(),
      axisLine: axisLine(),
      splitArea: { show: false },
    },
    visualMap: {
      show: false,
      min: 0,
      max,
      inRange: {
        color: [colors.dataSequential.low, colors.dataSequential.mid, colors.dataSequential.high],
      },
    },
    series: [
      {
        type: 'heatmap',
        data: rows.map(([, value], index) => [0, index, value]),
        label: {
          show: true,
          color: colors.text.primary,
          formatter: ({ value }) => String(value[2]),
          fontWeight: 600,
        },
        itemStyle: {
          borderColor: colors.border.subtle,
          borderWidth: 1,
        },
      },
    ],
  };
}

export function accessibilityContourOption(details = {}) {
  const transport = details.accessibility?.metrics || details.transport || {};
  const points = [
    ['Road', transport.nearestRoadKm, 20],
    ['Rail', transport.nearestRailKm, 30],
    ['Airport', transport.nearestAirportKm, 60],
    ['Bus', transport.nearestBusStopKm, 15],
  ];

  const normalized = points.map(([, distance, cap]) => {
    if (distance === null || distance === undefined || Number.isNaN(Number(distance))) return 0;
    const ratio = 1 - Math.min(Number(distance) / cap, 1);
    return Math.max(0, Math.round(ratio * 100));
  });

  return {
    backgroundColor: 'transparent',
    grid: { left: 24, right: 10, top: 26, bottom: 24 },
    xAxis: {
      type: 'category',
      data: points.map(([label]) => label),
      axisLabel: axisLabel(),
      axisLine: axisLine(),
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: axisLabel(),
      splitLine: { lineStyle: { color: split } },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        data: normalized,
        lineStyle: { color: cat[2], width: 2 },
        itemStyle: { color: cat[2] },
        areaStyle: { color: 'rgba(217, 119, 6, 0.12)' },
      },
    ],
  };
}

export function opportunityRankingOption(opportunities = []) {
  const rows = opportunities.slice(0, 20).map((zone) => {
    const score = Number(zone.opportunityScore) || 0;
    return {
      name: zone.name,
      score,
      color:
        score >= 70
          ? colors.dataSequential.high
          : score >= 40
            ? colors.dataSequential.mid
            : colors.text.tertiary,
    };
  });

  return {
    backgroundColor: 'transparent',
    grid: { left: 140, right: 18, top: 18, bottom: 18 },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: axisLabel(),
      splitLine: { lineStyle: { color: split } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((row) => row.name),
      axisLabel: {
        color: axis,
        fontSize: 11,
        width: 130,
        overflow: 'truncate',
      },
      axisLine: axisLine(),
    },
    series: [
      {
        type: 'bar',
        data: rows.map((row) => ({ value: row.score, itemStyle: { color: row.color } })),
        barCategoryGap: '25%',
        label: {
          show: true,
          position: 'right',
          color: colors.text.primary,
          fontWeight: 600,
        },
      },
    ],
  };
}

export function zoneComparisonRadarOption(zones = []) {
  const rows = zones.slice(0, 4);
  return {
    backgroundColor: 'transparent',
    legend: {
      bottom: 0,
      textStyle: { color: axis, fontSize: 11 },
    },
    radar: {
      radius: '62%',
      axisName: { color: axis, fontSize: 11 },
      splitLine: { lineStyle: { color: split } },
      splitArea: { areaStyle: { color: [colors.accent.subtle, colors.surface.sunken] } },
      axisLine: axisLine(),
      indicator: [
        { name: 'Infra', max: 100 },
        { name: 'Access', max: 100 },
        { name: 'Risk', max: 100 },
        { name: 'Zone', max: 100 },
      ],
    },
    series: [
      {
        type: 'radar',
        data: rows.map((zone, index) => ({
          name: zone.name,
          value: [
            zone.scores?.infrastructure ?? zone.analysis?.scores?.infrastructure ?? 0,
            zone.scores?.accessibility ?? zone.analysis?.scores?.accessibility ?? 0,
            zone.scores?.environmentalRisk ?? zone.analysis?.scores?.environmentalRisk ?? 0,
            zone.scores?.zoneCompatibility ?? zone.analysis?.scores?.zoneCompatibility ?? 0,
          ],
          areaStyle: { color: `${cat[index % cat.length]}22` },
          lineStyle: { color: cat[index % cat.length], width: 2 },
          itemStyle: { color: cat[index % cat.length] },
        })),
      },
    ],
  };
}
