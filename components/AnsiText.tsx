import React, { useMemo } from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { ThemeColors, useTheme } from '@/lib/useTheme';

type AnsiSegment = {
  text: string;
  style: TextStyle;
};

const ANSI_COLORS: Record<number, string> = {
  30: '#1B1B1F',
  31: '#C75B39',
  32: '#2F6F66',
  33: '#D0A03A',
  34: '#4F6FA9',
  35: '#9D5BA3',
  36: '#5BA3A3',
  37: '#E4DED5',
  90: '#6E6A62',
  91: '#E07A5F',
  92: '#4A9A8F',
  93: '#E8C547',
  94: '#6B8FBF',
  95: '#B87DB8',
  96: '#7DB8B8',
  97: '#F6F1E8',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#1B1B1F',
  41: '#C75B39',
  42: '#2F6F66',
  43: '#D0A03A',
  44: '#4F6FA9',
  45: '#9D5BA3',
  46: '#5BA3A3',
  47: '#E4DED5',
  100: '#6E6A62',
  101: '#E07A5F',
  102: '#4A9A8F',
  103: '#E8C547',
  104: '#6B8FBF',
  105: '#B87DB8',
  106: '#7DB8B8',
  107: '#F6F1E8',
};

const ESC = String.fromCharCode(27);
const ANSI_SGR_REGEX = new RegExp(`${ESC}\\[([0-9;]*)m`, 'g');

function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const regex = ANSI_SGR_REGEX;

  let lastIndex = 0;
  let currentStyle: TextStyle = {};
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const segmentText = text.slice(lastIndex, match.index);
      if (segmentText) {
        segments.push({ text: segmentText, style: { ...currentStyle } });
      }
    }

    const codes = match[1].split(';').map(Number).filter(n => !isNaN(n));

    for (const code of codes) {
      if (code === 0) {
        currentStyle = {};
      } else if (code === 1) {
        currentStyle.fontWeight = 'bold';
      } else if (code === 2) {
        currentStyle.opacity = 0.6;
      } else if (code === 3) {
        currentStyle.fontStyle = 'italic';
      } else if (code === 4) {
        currentStyle.textDecorationLine = 'underline';
      } else if (code === 9) {
        currentStyle.textDecorationLine = 'line-through';
      } else if (code >= 30 && code <= 37) {
        currentStyle.color = ANSI_COLORS[code];
      } else if (code >= 90 && code <= 97) {
        currentStyle.color = ANSI_COLORS[code];
      } else if (code === 39) {
        delete currentStyle.color;
      } else if (code >= 40 && code <= 47) {
        currentStyle.backgroundColor = ANSI_BG_COLORS[code];
      } else if (code >= 100 && code <= 107) {
        currentStyle.backgroundColor = ANSI_BG_COLORS[code];
      } else if (code === 49) {
        delete currentStyle.backgroundColor;
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: { ...currentStyle } });
  }

  return segments;
}

type Props = {
  children: string;
  style?: TextStyle;
  numberOfLines?: number;
};

export function AnsiText({ children, style, numberOfLines }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const segments = useMemo(() => parseAnsi(children), [children]);

  if (segments.length === 0) {
    return (
      <Text style={[styles.base, style]} numberOfLines={numberOfLines}>
        {' '}
      </Text>
    );
  }

  if (segments.length === 1 && Object.keys(segments[0].style).length === 0) {
    return (
      <Text style={[styles.base, style]} numberOfLines={numberOfLines}>
        {segments[0].text}
      </Text>
    );
  }

  return (
    <Text style={[styles.base, style]} numberOfLines={numberOfLines}>
      {segments.map((segment, i) => (
        <Text key={i} style={segment.style}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  base: {
    fontFamily: 'JetBrainsMono',
    fontSize: 10,
    color: colors.textMuted,
  },
});
