/**
 * NBR 5426 / ISO 2859-1 — Inspeção Normal, Plano Simples
 * Tabelas e lógica para controle de qualidade por amostragem
 */

export const AQL_OPTIONS = ['0.065', '0.10', '0.15', '0.25', '0.40', '0.65', '1.0', '1.5', '2.5', '4.0', '6.5', '10'] as const;
export type AQLValue = typeof AQL_OPTIONS[number];

export const INSPECTION_LEVELS = ['I', 'II', 'III'] as const;
export type InspectionLevel = typeof INSPECTION_LEVELS[number];

// Letras-código e tamanhos de amostra
const CODE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q'] as const;
type CodeLetter = typeof CODE_LETTERS[number];

const SAMPLE_SIZES: Record<CodeLetter, number> = {
  A: 2,
  B: 3,
  C: 5,
  D: 8,
  E: 13,
  F: 20,
  G: 32,
  H: 50,
  J: 80,
  K: 125,
  L: 200,
  M: 315,
  N: 500,
  P: 800,
  Q: 1250,
};

// Limites de lote por nível de inspeção
// [min, max]: retorna o índice da letra no array CODE_LETTERS
type LotRange = [number, number];
type LevelTable = Array<[LotRange, number]>; // índice para CODE_LETTERS

const LEVEL_TABLES: Record<InspectionLevel, LevelTable> = {
  I: [
    [[2, 8], 0],       // A
    [[9, 15], 0],      // A
    [[16, 25], 0],     // A
    [[26, 50], 1],     // B
    [[51, 90], 2],     // C
    [[91, 150], 3],    // D
    [[151, 280], 4],   // E
    [[281, 500], 5],   // F
    [[501, 1200], 6],  // G
    [[1201, 3200], 7], // H
    [[3201, 10000], 9], // K
    [[10001, 35000], 10], // L
    [[35001, 150000], 11], // M
    [[150001, 500000], 12], // N
    [[500001, Infinity], 13], // P
  ],
  II: [
    [[2, 8], 0],       // A
    [[9, 15], 1],      // B
    [[16, 25], 2],     // C
    [[26, 50], 3],     // D
    [[51, 90], 4],     // E
    [[91, 150], 5],    // F
    [[151, 280], 6],   // G
    [[281, 500], 7],   // H
    [[501, 1200], 8],  // J
    [[1201, 3200], 9], // K
    [[3201, 10000], 10], // L
    [[10001, 35000], 11], // M
    [[35001, 150000], 12], // N
    [[150001, 500000], 13], // P
    [[500001, Infinity], 14], // Q
  ],
  III: [
    [[2, 8], 1],       // B
    [[9, 15], 2],      // C
    [[16, 25], 3],     // D
    [[26, 50], 4],     // E
    [[51, 90], 5],     // F
    [[91, 150], 6],    // G
    [[151, 280], 7],   // H
    [[281, 500], 8],   // J
    [[501, 1200], 9],  // K
    [[1201, 3200], 10], // L
    [[3201, 10000], 11], // M
    [[10001, 35000], 12], // N
    [[35001, 150000], 13], // P
    [[150001, 500000], 14], // Q
    [[500001, Infinity], 14], // Q
  ],
};

// Tabela AQL — Inspeção Normal ISO 2859-1
// Valor: número de aceitação (Ac). null = usar seta.
// 'D' = down (use próxima letra maior), 'U' = up (use letra anterior)
type AcValue = number | 'D' | 'U';

// Colunas: 0.065, 0.10, 0.15, 0.25, 0.40, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5, 10
const AQL_TABLE: Record<CodeLetter, AcValue[]> = {
  //          0.065  0.10   0.15   0.25   0.40   0.65   1.0    1.5    2.5    4.0    6.5    10
  A: [        'D',   'D',   'D',   'D',   'D',   'D',   'D',   'D',   'D',   0,     'U',   'U'  ],
  B: [        'D',   'D',   'D',   'D',   'D',   'D',   'D',   'D',   0,     'U',   'U',   'U'  ],
  C: [        'D',   'D',   'D',   'D',   'D',   'D',   'D',   0,     'U',   'U',   1,     'U'  ],
  D: [        'D',   'D',   'D',   'D',   'D',   'D',   0,     'U',   'U',   1,     2,     'U'  ],
  E: [        'D',   'D',   'D',   'D',   'D',   0,     'U',   'U',   1,     2,     3,     'U'  ],
  F: [        'D',   'D',   'D',   'D',   0,     'U',   'U',   1,     2,     3,     5,     'U'  ],
  G: [        'D',   'D',   'D',   0,     'U',   'U',   1,     2,     3,     5,     7,     10   ],
  H: [        'D',   'D',   0,     'U',   'U',   1,     2,     3,     5,     7,     10,    14   ],
  J: [        'D',   0,     'U',   'U',   1,     2,     3,     5,     7,     10,    14,    21   ],
  K: [        0,     'U',   'U',   1,     2,     3,     5,     7,     10,    14,    21,    21   ],
  L: [        'U',   'U',   1,     2,     3,     5,     7,     10,    14,    21,    21,    21   ],
  M: [        'U',   1,     2,     3,     5,     7,     10,    14,    21,    21,    21,    21   ],
  N: [        1,     2,     3,     5,     7,     10,    14,    21,    21,    21,    21,    21   ],
  P: [        2,     3,     5,     7,     10,    14,    21,    21,    21,    21,    21,    21   ],
  Q: [        3,     5,     7,     10,    14,    21,    21,    21,    21,    21,    21,    21   ],
};

const AQL_COL_INDEX: Record<string, number> = {
  '0.065': 0,
  '0.10': 1,
  '0.15': 2,
  '0.25': 3,
  '0.40': 4,
  '0.65': 5,
  '1.0': 6,
  '1.5': 7,
  '2.5': 8,
  '4.0': 9,
  '6.5': 10,
  '10': 11,
};

/** Obtém o índice de código baseado no tamanho do lote e nível de inspeção */
function getCodeLetterIndex(lotSize: number, level: InspectionLevel): number {
  const table = LEVEL_TABLES[level];
  for (const [[min, max], idx] of table) {
    if (lotSize >= min && lotSize <= max) return idx;
  }
  return 14; // Q (máximo)
}

export interface SamplingPlanCategory {
  codeLetter: string;
  sampleSize: number;
  ac: number;
  re: number;
}

export interface SamplingPlan {
  codeLetterBase: string;
  critical: SamplingPlanCategory;
  major: SamplingPlanCategory;
  minor: SamplingPlanCategory;
  requiredSampleSize: number;
}

/** Resolve setas D/U percorrendo a tabela até encontrar valor numérico */
function resolveAc(letterIndex: number, aqlColIndex: number): { letterIndex: number; ac: number } {
  let idx = letterIndex;
  const maxIterations = CODE_LETTERS.length;
  let iterations = 0;

  while (iterations < maxIterations) {
    const letter = CODE_LETTERS[idx] as CodeLetter;
    const val = AQL_TABLE[letter][aqlColIndex];

    if (typeof val === 'number') {
      return { letterIndex: idx, ac: val };
    }

    if (val === 'D') {
      // Desce para letra maior (maior amostra)
      if (idx < CODE_LETTERS.length - 1) {
        idx++;
      } else {
        // Chegou no extremo — usar Ac=0 conservador
        return { letterIndex: idx, ac: 0 };
      }
    } else if (val === 'U') {
      // Sobe para letra menor
      if (idx > 0) {
        idx--;
      } else {
        // Chegou no extremo — usar Ac=0 conservador
        return { letterIndex: idx, ac: 0 };
      }
    }

    iterations++;
  }

  // Fallback conservador
  return { letterIndex: idx, ac: 0 };
}

/**
 * Calcula o plano de amostragem NBR 5426 / ISO 2859-1, Inspeção Normal, Plano Simples.
 *
 * @param lotSize      Tamanho do lote
 * @param aqlCritical  AQL para defeitos críticos (ex: '0.065')
 * @param aqlMajor     AQL para defeitos maiores (ex: '1.0')
 * @param aqlMinor     AQL para defeitos menores (ex: '4.0')
 * @param level        Nível de inspeção ('I', 'II', 'III')
 */
export function getSamplingPlan(
  lotSize: number,
  aqlCritical: string,
  aqlMajor: string,
  aqlMinor: string,
  level: InspectionLevel = 'II',
): SamplingPlan {
  const baseLetterIdx = getCodeLetterIndex(lotSize, level);
  const baseLetter = CODE_LETTERS[baseLetterIdx];

  const colCritical = AQL_COL_INDEX[aqlCritical] ?? 0;
  const colMajor = AQL_COL_INDEX[aqlMajor] ?? 6;
  const colMinor = AQL_COL_INDEX[aqlMinor] ?? 9;

  const resolvedCritical = resolveAc(baseLetterIdx, colCritical);
  const resolvedMajor = resolveAc(baseLetterIdx, colMajor);
  const resolvedMinor = resolveAc(baseLetterIdx, colMinor);

  const buildCategory = (resolved: { letterIndex: number; ac: number }): SamplingPlanCategory => {
    const letter = CODE_LETTERS[resolved.letterIndex] as CodeLetter;
    const sampleSize = SAMPLE_SIZES[letter];
    const ac = resolved.ac;
    return { codeLetter: letter, sampleSize, ac, re: ac + 1 };
  };

  const critical = buildCategory(resolvedCritical);
  const major = buildCategory(resolvedMajor);
  const minor = buildCategory(resolvedMinor);

  const requiredSampleSize = Math.max(critical.sampleSize, major.sampleSize, minor.sampleSize);

  return {
    codeLetterBase: baseLetter,
    critical,
    major,
    minor,
    requiredSampleSize,
  };
}

/**
 * Calcula o número de caixas a inspecionar usando a fórmula √n + 1 (arredondado para cima).
 * Padrão interno Kingraf para distribuição de amostragem em produto acabado.
 *
 * Exemplo: 42 caixas → √42 + 1 ≈ 7,48 → 8 caixas
 *
 * @param totalBoxes  Total de caixas no sub-lote
 */
export function getBoxesToOpen(totalBoxes: number): number {
  if (totalBoxes <= 0) return 0;
  return Math.ceil(Math.sqrt(totalBoxes) + 1);
}

/**
 * Distribui a amostragem de forma uniforme entre as caixas disponíveis.
 * Retorna array com os números das caixas a serem abertas (base 1).
 *
 * @param boxesToOpen  Quantidade de caixas a abrir
 * @param totalBoxes   Total de caixas no lote
 */
export function distributeSample(boxesToOpen: number, totalBoxes: number): number[] {
  if (boxesToOpen <= 0 || totalBoxes <= 0) return [];
  if (boxesToOpen >= totalBoxes) {
    return Array.from({ length: totalBoxes }, (_, i) => i + 1);
  }

  const result: number[] = [];
  const step = totalBoxes / boxesToOpen;

  for (let i = 0; i < boxesToOpen; i++) {
    // Distribuição uniforme com offset de 0.5 para centralizar no intervalo
    const boxNumber = Math.round(step * i + step / 2);
    result.push(Math.max(1, Math.min(totalBoxes, boxNumber)));
  }

  // Remove duplicatas que possam surgir em arredondamentos
  return [...new Set(result)].sort((a, b) => a - b);
}
