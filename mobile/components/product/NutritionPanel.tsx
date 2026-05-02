import { Text, View } from 'react-native';

import type { OFFNutrition } from '@/lib/openFoodFacts';

type Row = {
  label: string;
  value: number;
  unit: string;
  indent?: boolean;
};

type NutritionPanelProps = {
  nutrition: OFFNutrition;
};

export default function NutritionPanel({ nutrition }: NutritionPanelProps) {
  const rows: Row[] = [
    { label: 'Energy', value: nutrition.energyKcal100g ?? NaN, unit: 'kcal' },
    { label: 'Fat', value: nutrition.fat100g ?? NaN, unit: 'g' },
    { label: 'of which saturates', value: nutrition.saturatedFat100g ?? NaN, unit: 'g', indent: true },
    { label: 'Sugars', value: nutrition.sugars100g ?? NaN, unit: 'g' },
    { label: 'Salt', value: nutrition.salt100g ?? NaN, unit: 'g' },
    { label: 'Protein', value: nutrition.proteins100g ?? NaN, unit: 'g' },
  ].filter((r): r is Row => Number.isFinite(r.value));

  if (rows.length === 0) return null;

  return (
    <View className="bg-surface border-[0.5px] border-border rounded-xl overflow-hidden">
      <View className="px-4 pt-3.5 pb-2">
        <Text className="text-h3 text-primary">Nutrition</Text>
        <Text className="text-caption text-tertiary mt-0.5">
          Per 100g · via Open Food Facts
        </Text>
      </View>
      {rows.map((row, idx) => (
        <View
          key={row.label}
          className={`flex-row items-baseline justify-between px-4 py-2.5 ${
            idx < rows.length - 1 ? 'border-b-[0.5px] border-border' : ''
          }`}
        >
          <Text
            className={
              row.indent
                ? 'flex-1 text-body-sm text-secondary pl-3'
                : 'flex-1 text-body text-primary'
            }
            numberOfLines={1}
          >
            {row.label}
          </Text>
          <Text
            className="text-mono-lg text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatValue(row.value)} {row.unit}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Small values get one decimal (salt is often 0.3g); larger values round to
// integer to keep the column compact and readable.
function formatValue(value: number): string {
  if (value < 10) return value.toFixed(1).replace(/\.0$/, '');
  return Math.round(value).toString();
}
