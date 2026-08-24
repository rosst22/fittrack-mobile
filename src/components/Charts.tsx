// Hand-rolled charts on react-native-svg.
//
// The web app uses recharts, which is DOM-only and cannot come along. These are
// deliberately minimal — a line chart and a bar chart, both fixed-height and
// non-interactive — because a 14-point trend does not need a charting library
// and every dependency here has to be built into the native binary.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { colors, spacing } from '@/constants/theme';

const H = 150;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

type Point = { label: string; value: number | null };

function niceMax(max: number) {
  if (max <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / mag) * mag;
}

/** Shared frame: title, optional target line, x labels at each end. */
function Frame({
  title,
  points,
  children,
  max,
  unit,
}: {
  title: string;
  points: Point[];
  children: (w: number, plotH: number, max: number) => React.ReactNode;
  max: number;
  unit?: string;
}) {
  const width = 320; // viewBox units; the SVG scales to the container
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const first = points[0]?.label ?? '';
  const last = points[points.length - 1]?.label ?? '';

  return (
    <View style={styles.chart}>
      <View style={styles.chartHead}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={styles.chartMax}>
          max {Math.round(max).toLocaleString()}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`}>
        {/* baseline */}
        <Line
          x1={0}
          y1={PAD_TOP + plotH}
          x2={width}
          y2={PAD_TOP + plotH}
          stroke={colors.border}
          strokeWidth={1}
        />
        {children(width, plotH, max)}
      </Svg>
      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{first}</Text>
        <Text style={styles.axisLabel}>{last}</Text>
      </View>
    </View>
  );
}

export function LineChart({
  title,
  points,
  unit,
  target,
}: {
  title: string;
  points: Point[];
  unit?: string;
  target?: number | null;
}) {
  const max = useMemo(() => {
    const vals = points.map((p) => p.value ?? 0).concat(target ? [target] : []);
    return niceMax(Math.max(...vals, 0));
  }, [points, target]);

  if (points.length === 0) return null;

  return (
    <Frame title={title} points={points} max={max} unit={unit}>
      {(w, plotH) => {
        const step = points.length > 1 ? w / (points.length - 1) : w;
        const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

        // Break the path wherever a day has no data, so a gap reads as "no
        // entry" instead of a line sloping through zero.
        let d = '';
        let penDown = false;
        points.forEach((p, i) => {
          if (p.value == null) {
            penDown = false;
            return;
          }
          const cmd = penDown ? 'L' : 'M';
          d += `${cmd}${i * step},${y(p.value)} `;
          penDown = true;
        });

        return (
          <>
            {target ? (
              <Line
                x1={0}
                y1={y(target)}
                x2={w}
                y2={y(target)}
                stroke={colors.textMuted}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
            {d ? <Path d={d.trim()} stroke={colors.accent} strokeWidth={2} fill="none" /> : null}
            {points.map((p, i) =>
              p.value == null ? null : (
                <Circle key={i} cx={i * step} cy={y(p.value)} r={2.5} fill={colors.accent} />
              )
            )}
          </>
        );
      }}
    </Frame>
  );
}

export function BarChart({
  title,
  points,
  unit,
  target,
}: {
  title: string;
  points: Point[];
  unit?: string;
  target?: number | null;
}) {
  const max = useMemo(() => {
    const vals = points.map((p) => p.value ?? 0).concat(target ? [target] : []);
    return niceMax(Math.max(...vals, 0));
  }, [points, target]);

  if (points.length === 0) return null;

  return (
    <Frame title={title} points={points} max={max} unit={unit}>
      {(w, plotH) => {
        const slot = w / points.length;
        const barW = Math.max(slot * 0.6, 2);
        const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

        return (
          <>
            {target ? (
              <Line
                x1={0}
                y1={y(target)}
                x2={w}
                y2={y(target)}
                stroke={colors.textMuted}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
            {points.map((p, i) => {
              const v = p.value ?? 0;
              const top = y(v);
              return (
                <Rect
                  key={i}
                  x={i * slot + (slot - barW) / 2}
                  y={top}
                  width={barW}
                  height={Math.max(PAD_TOP + plotH - top, 0)}
                  rx={2}
                  fill={target && v >= target ? colors.accent : '#2F6B45'}
                />
              );
            })}
          </>
        );
      }}
    </Frame>
  );
}

/** Two series on one axis, for comparisons like eaten vs. burned. */
export function DualLineChart({
  title,
  a,
  b,
  aLabel,
  bLabel,
  unit,
}: {
  title: string;
  a: Point[];
  b: Point[];
  aLabel: string;
  bLabel: string;
  unit?: string;
}) {
  const max = useMemo(
    () => niceMax(Math.max(...a.map((p) => p.value ?? 0), ...b.map((p) => p.value ?? 0), 0)),
    [a, b]
  );

  if (a.length === 0) return null;

  const build = (pts: Point[], w: number, plotH: number) => {
    const step = pts.length > 1 ? w / (pts.length - 1) : w;
    const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
    let d = '';
    let penDown = false;
    pts.forEach((p, i) => {
      if (p.value == null) {
        penDown = false;
        return;
      }
      d += `${penDown ? 'L' : 'M'}${i * step},${y(p.value)} `;
      penDown = true;
    });
    return d.trim();
  };

  return (
    <>
      <Frame title={title} points={a} max={max} unit={unit}>
        {(w, plotH) => (
          <>
            <Path d={build(a, w, plotH)} stroke={colors.accent} strokeWidth={2} fill="none" />
            <Path d={build(b, w, plotH)} stroke="#F59E0B" strokeWidth={2} fill="none" />
          </>
        )}
      </Frame>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
          <Text style={styles.axisLabel}>{aLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.axisLabel}>{bLabel}</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  chart: { gap: 4 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chartMax: { color: colors.textMuted, fontSize: 12 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { color: colors.textMuted, fontSize: 11 },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: -spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 3, borderRadius: 2 },
});
