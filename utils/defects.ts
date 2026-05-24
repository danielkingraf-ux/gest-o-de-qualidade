export type DefectEntry = { name: string; count: number };

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(uv|hs|cv|col)\s*[:_\-\]]\s*/i, '')
    .replace(/[\[\]()]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const REAL_DEFECT_KEYS = new Set([
  'amassado',
  'amassados',
  'atrito',
  'buraco cartao',
  'codagem',
  'colagem com falha',
  'cola fraca',
  'cor',
  'cor fora do padrao',
  'corte',
  'corte incorreto',
  'corte irregular',
  'decalque',
  'desc falha',
  'destacadeira',
  'dimensao incorreta',
  'dobrado',
  'dobras',
  'acabamento aspero',
  'ausencia',
  'enchimento texto',
  'falha',
  'falha corte',
  'falha de texto',
  'falha de verniz',
  'falha hotfilm',
  'falha no corte',
  'falha plastificacao',
  'falha texto',
  'falha verniz',
  'falta cola',
  'falta de cola',
  'falta de impressao',
  'fiapo',
  'fiapos',
  'fundo amassado aberto',
  'fundo virado',
  'gramatura',
  'hot stamping ausente',
  'hot stamping com falha',
  'hotfilm ausencia',
  'hs desc falha',
  'impressao desc',
  'impressao dupla',
  'inicio impressao',
  'mancha',
  'manchas',
  'modelo misturado',
  'outro',
  'outros',
  'pinta',
  'pintas',
  'quebra tinta',
  'rasgado',
  'raspado',
  'rebarba',
  'registro',
  'registro desalinhado',
  'relevo desc',
  'risco',
  'riscado',
  'sujo',
  'texto fechado',
  'uv com falha',
  'uv irregular',
  'variacao',
  'verniz',
  'verniz falhado',
  'vinco',
  'vinco estourado',
  'vinco fraco',
  'vinco incorreto',
]);

const OPERATIONAL_KEYS = new Set([
  'aprovadas',
  'boxes per pallet',
  'boxes to inspect',
  'custo de revisao',
  'defects critical',
  'defects major',
  'defects minor',
  'em escolha',
  'folhas por pilha',
  'homem hora',
  'homem hora total',
  'pallet number',
  'quantidade boa recuperada',
  'quantidade enviada',
  'quantidade pendente',
  'quantidade refugada',
  'quantidade revisada',
  'quantidade rodada',
  'quantidade solicitada',
  'qty aprovada',
  'qty aprovadas',
  'qty boa',
  'qty escolha',
  'qty produzida',
  'qty refugada',
  'qty refugo',
  'qty reprovada',
  'qty reprovadas',
  'qty revisada',
  'qty revisadas',
  'qty solicitada',
  'refugo',
  'reprovadas',
  'rodadas',
  'saldo',
  'sample size',
  'tempo de revisao',
  'total horas',
  'total minutos',
  'total pessoas',
  'units per box',
]);

export const isOperationalMetricKey = (key: string) => OPERATIONAL_KEYS.has(normalize(key));

export const isRealDefectKey = (key: string) => {
  const normalized = normalize(key);
  return REAL_DEFECT_KEYS.has(normalized) && !OPERATIONAL_KEYS.has(normalized);
};

export const normalizeDefectLabel = (key: string) =>
  normalize(key).replace(/\b\w/g, char => char.toUpperCase());

export const toDefectEntry = (key: string, value: unknown): DefectEntry | null => {
  if (!isRealDefectKey(key)) return null;
  const raw = typeof value === 'object' && value !== null && 'count' in value
    ? (value as { count?: unknown }).count
    : value;
  const count = Number(raw);
  if (!Number.isFinite(count) || count <= 0) return null;
  return { name: normalizeDefectLabel(key), count };
};
