/**
 * Deduplicação de inspeções — fonte única de verdade para todas as telas.
 *
 * Regras de negócio (confirmadas com a operação):
 *
 * 1. PRODUÇÃO INICIAL (impressão): a mesma rodada pode ter VÁRIOS apontamentos
 *    legítimos (parciais por turno). Eles devem ser SOMADOS. Só é descartado o
 *    duplo-save: registro da mesma OP + mesma rodada + mesmas quantidades
 *    gravado em janela curta (ex.: clique duplo no salvar — caso real da
 *    OP 19714, duas linhas idênticas com 36s de diferença).
 *
 * 2. PRODUTO ACABADO: o nº do laudo é TEXTO ("00123/25"). Uma OP grande pode
 *    ter vários laudos (entregas fracionadas) — todos contam. Mais de um
 *    registro com o MESMO nº de laudo é correção/duplicata: vale o mais
 *    recente. Nunca converter o laudo para número (Number("00123/25") = NaN,
 *    o que colapsava todos os laudos na chave 1).
 */

/** Janela de tempo para considerar dois registros idênticos como duplo-save. */
export const DOUBLE_SAVE_WINDOW_MS = 5 * 60_000;

export type ObsRecord = Record<string, any>;

/** Parse tolerante do campo observations (string JSON, objeto ou texto livre). */
export const parseObsSafe = (v: unknown): ObsRecord => {
  if (!v) return {};
  if (typeof v === 'object') return v as ObsRecord;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return {};
};

export const isObsProdutoAcabado = (obs: ObsRecord): boolean =>
  obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis === true;

export const isObsProducaoInicial = (obs: ObsRecord): boolean =>
  obs.process_area === 'producao_inicial';

/** Chave do laudo de Produto Acabado — sempre a STRING normalizada. */
export const laudoKey = (obs: ObsRecord): string =>
  String(obs.laudo_numero ?? '').trim().toUpperCase();

export interface DedupOptions<T> {
  /** Extrai o observations já parseado da linha. */
  getObs: (row: T) => ObsRecord;
  /** Extrai o created_at ISO da linha. */
  getCreatedAt: (row: T) => string | null | undefined;
  /**
   * Escopo da deduplicação (normalmente a OP). Obrigatório quando as linhas
   * misturam OPs diferentes (relatórios); pode ser omitido em telas de OP única.
   */
  getScope?: (row: T) => string;
}

/**
 * Remove apenas duplicatas reais de uma lista de inspeções, preservando a
 * ordem original das linhas mantidas:
 *
 * - producao_inicial: descarta duplo-saves (mesma rodada + mesmo saldo_unidades
 *   dentro de DOUBLE_SAVE_WINDOW_MS). Parciais da mesma rodada são mantidos.
 * - produto_acabado: mantém só o registro mais recente de cada nº de laudo
 *   (string). Registros sem nº de laudo são todos mantidos.
 * - demais registros (texto livre, outras áreas): mantidos.
 */
export function dedupInspections<T>(rows: T[], opts: DedupOptions<T>): T[] {
  const { getObs, getCreatedAt, getScope } = opts;

  const obsCache = new Map<T, ObsRecord>();
  const obsOf = (row: T): ObsRecord => {
    let obs = obsCache.get(row);
    if (!obs) { obs = getObs(row) ?? {}; obsCache.set(row, obs); }
    return obs;
  };
  const timeOf = (row: T): number => {
    const t = new Date(getCreatedAt(row) ?? 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const scopeOf = (row: T): string => (getScope ? String(getScope(row) ?? '').trim().toUpperCase() : '');

  // ── Produto Acabado: mais recente por (escopo + nº de laudo) ──
  const latestByLaudo = new Map<string, T>();
  for (const row of rows) {
    const obs = obsOf(row);
    if (!isObsProdutoAcabado(obs)) continue;
    const laudo = laudoKey(obs);
    if (!laudo) continue; // sem nº de laudo: não dá pra distinguir → mantém todos
    const key = `${scopeOf(row)}|${laudo}`;
    const prev = latestByLaudo.get(key);
    if (!prev || timeOf(row) > timeOf(prev)) latestByLaudo.set(key, row);
  }

  // ── Produção inicial: descarta só duplo-saves idênticos em janela curta ──
  const keptTimesBySig = new Map<string, number[]>();
  const droppedDoubleSaves = new Set<T>();
  const sortedAsc = [...rows].sort((a, b) => timeOf(a) - timeOf(b));
  for (const row of sortedAsc) {
    const obs = obsOf(row);
    if (!isObsProducaoInicial(obs) || !obs.saldo_unidades) continue;
    const sig = [
      scopeOf(row),
      String(obs.numero_rodada ?? '1'),
      JSON.stringify(obs.saldo_unidades),
    ].join('|');
    const t = timeOf(row);
    const kept = keptTimesBySig.get(sig) ?? [];
    if (kept.some(k => Math.abs(t - k) <= DOUBLE_SAVE_WINDOW_MS)) {
      droppedDoubleSaves.add(row);
    } else {
      kept.push(t);
      keptTimesBySig.set(sig, kept);
    }
  }

  return rows.filter(row => {
    if (droppedDoubleSaves.has(row)) return false;
    const obs = obsOf(row);
    if (isObsProdutoAcabado(obs)) {
      const laudo = laudoKey(obs);
      if (laudo) return latestByLaudo.get(`${scopeOf(row)}|${laudo}`) === row;
    }
    return true;
  });
}
