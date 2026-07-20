import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export function EChartPanel({ option, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
    chart.setOption(option);
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [option]);

  return <div ref={ref} className={`h-56 w-full ${className}`} />;
}
