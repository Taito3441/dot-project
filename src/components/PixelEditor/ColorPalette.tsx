import React from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { getDefaultPalette } from '../../utils/pixelArt';

interface ColorPaletteProps {
  palette: string[];
  currentColor: number;
  onColorChange: (colorIndex: number) => void;
  onPaletteChange: (newPalette: string[]) => void;
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({
  palette,
  currentColor,
  onColorChange,
  onPaletteChange,
}) => {
  const addColor = () => {
    const newColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    onPaletteChange([...palette, newColor]);
  };

  const resetPalette = () => {
    onPaletteChange(getDefaultPalette());
  };

  const updateColor = (index: number, color: string) => {
    const newPalette = [...palette];
    newPalette[index] = color;
    onPaletteChange(newPalette);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 min-w-[260px] w-80">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-semibold text-gray-900">Color Palette</h3>
        <div className="flex space-x-3">
          <button
            onClick={resetPalette}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            title="Reset to default palette"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            onClick={addColor}
            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors duration-200"
            title="Add random color"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* カラーパレット本体: n行×8列のグリッドで縦長に */}
      <div className="grid grid-cols-8 gap-0 py-1">
        {/* Transparent/Eraser */}
        <button
          onClick={() => onColorChange(0)}
          className={`w-8 h-8 flex-shrink-0 rounded-lg border-2 transition-all duration-200 m-0 mx-0 ${
            currentColor === 0
              ? 'border-indigo-500 ring-2 ring-indigo-200'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          style={{
            background: 'repeating-conic-gradient(#f3f4f6 0% 25%, transparent 0% 50%) 50% / 10px 10px',
          }}
          title="Transparent"
        />

        {/* Color swatches */}
        {palette.map((color, index) => (
          <div key={index} className="relative flex-shrink-0 m-0 p-0 mx-0">
            <button
              onClick={() => onColorChange(index + 1)}
              className={`w-8 h-8 flex-shrink-0 rounded-lg border-2 transition-transform transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 m-0 mx-0 \
                ${currentColor === index + 1
                  ? 'border-indigo-500 ring-2 ring-indigo-200 scale-110'
                  : 'border-gray-300 hover:border-gray-400 hover:scale-110'}
              `}
              style={{ backgroundColor: color }}
              title={color}
              tabIndex={0}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => updateColor(index, e.target.value)}
              onClick={() => onColorChange(index + 1)}
              className="absolute left-0 top-0 w-8 h-8 opacity-0 cursor-pointer z-10"
              style={{ pointerEvents: 'auto' }}
              tabIndex={-1}
              aria-label={`Change color ${color}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 bg-gray-50 rounded text-base text-gray-700">
        Current: {currentColor === 0 ? 'Transparent' : palette[currentColor - 1] || 'None'}
      </div>
    </div>
  );
};