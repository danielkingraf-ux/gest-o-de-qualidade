/**
 * Script de importação de dados históricos CSV → Supabase
 * Execução: SERVICE_ROLE_KEY=xxx node scripts/import-csv.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const SUPABASE_URL     = 'https://juatgymcjvnofllfennk.supabase.co';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || '';
const CSV_PATH         = process.env.CSV_PATH
  || 'C:/Users/Gustavo Oliveira/Downloads/dados_qualidade_2019_2026_1.csv';
const BATCH_SIZE = 150;

if (!SERVICE_ROLE_KEY) {
  console.error('\n❌ SERVICE_ROLE_KEY não definida.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Mapeamento setor → process_type
const SETOR_MAP = {
  IMPRESSAO_OFFSET:   'OFFSET',
  IMPRESSAO_UV:       'UV',
  HOT_STAMPING:       'HOT_STAMPING',
  CORTE_VINCO:        'ACABAMENTO',
  ESCOLHAS:           'ESCOLHAS',
  IMPRESSAO_ESCOLHAS: 'ESCOLHAS',
};

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x; }

function buildDefects(row, pt) {
  const d = [];
  const add = (k, name, icon) => { const c = n(row[k]); if (c > 0) d.push({ id: k, name, count: c, icon }); };
  if (pt === 'OFFSET') {
    add('PINTAS','Pintas','blur_on'); add('COR','Cor','palette');
    add('REGISTRO','Registro','grid_view'); add('MANCHAS','Manchas','texture');
    add('SUJEIRA','Sujeira','cleaning_services'); add('DECALQUE','Decalque','layers');
    add('TINTA_VERNIZ','Tinta/Verniz','imagesearch_roller'); add('FIAPOS','Fiapos','straighten');
    add('FALHA_VERNIZ','Falha Verniz','imagesearch_roller'); add('FALHA_TEXTO','Falha Texto','format_color_text');
    add('TEXTO_FECHADO','Texto Fechado','block'); add('OUTROS','Outros','more_horiz');
  } else if (pt === 'UV') {
    add('COR','Cor','palette'); add('REGISTRO','Registro','grid_view');
    add('VERNIZ','Verniz','brush'); add('ACABAMENTO_ASPERO','Acab. Áspero','texture');
    add('OUTROS','Outros','more_horiz');
  } else if (pt === 'HOT_STAMPING') {
    add('FALHA','Falha','warning'); add('ENTOPIMENTO','Enchimento','format_color_fill');
    add('AUSENCIA','Ausência','visibility_off'); add('QUEIMADO','Queimado','local_fire_department');
  } else if (pt === 'ACABAMENTO') {
    add('CORTE','Corte','content_cut'); add('VINCO','Vinco','unfold_more');
    add('TRAVA','Trava','lock'); add('RELEVO','Relevo','vitals');
    add('DESTAQUE','Destaque','star'); add('OUTRO','Outro','more_horiz');
  }
  return d;
}

function status(reprovado, totalDefeitos) {
  if (n(reprovado) > 0) return 'REJECTED';
  if (n(totalDefeitos) > 0) return 'RESTRICTED';
  return 'APPROVED';
}

async function readCSV(path) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    if (!headers) { headers = cols.map(h => h.trim()); continue; }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

// Upsert por name: fetch existentes + insert novos
async function syncByName(table, names, extra = {}) {
  const arr = [...names].filter(Boolean);
  if (!arr.length) return {};

  // Buscar existentes
  const { data: existing } = await sb.from(table).select('id, name').in('name', arr);
  const map = {};
  (existing || []).forEach(r => { map[r.name] = r.id; });

  // Inserir os que faltam
  const toInsert = arr.filter(name => !map[name]).map(name => ({ name, ...extra }));
  if (toInsert.length > 0) {
    // em lotes de 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const { data, error } = await sb.from(table).insert(toInsert.slice(i, i + 100)).select('id, name');
      if (error) { console.error(`Erro insert ${table}:`, error.message); continue; }
      (data || []).forEach(r => { map[r.name] = r.id; });
    }
  }
  return map;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log('\n📂 Lendo CSV...');
const allRows = await readCSV(CSV_PATH);
console.log(`✅ ${allRows.length} linhas lidas`);

// Coletar nomes únicos
const operatorNames = new Set();
const analystNames  = new Set();
const opNumbers     = new Set();

for (const row of allRows) {
  const opNorm = (row['OPERADOR_NORM'] || row['OPERADOR'] || '').trim();
  if (opNorm) operatorNames.add(opNorm);

  (row['ANALISTA'] || '').split('/').map(s => s.trim()).filter(Boolean).forEach(a => analystNames.add(a));

  if (row['OP']) opNumbers.add(row['OP'].trim());
}

console.log(`\n👷 Operadores: ${operatorNames.size}`);
console.log(`🔬 Analistas:  ${analystNames.size}`);
console.log(`📋 OPs:        ${opNumbers.size}`);

console.log('\n⏳ Sincronizando operadores...');
const operatorMap = await syncByName('operators', operatorNames, { code: '', active: true });
console.log(`   ✅ ${Object.keys(operatorMap).length} operadores`);

console.log('⏳ Sincronizando analistas...');
const analystMap = await syncByName('analysts', analystNames, { email: '', tipo: 'ambos', active: true });
console.log(`   ✅ ${Object.keys(analystMap).length} analistas`);

console.log('⏳ Sincronizando ordens de produção...');
// Buscar ordens já existentes
const { data: existingOrders } = await sb.from('orders').select('id, op').in('op', [...opNumbers]);
const orderMap = {};
(existingOrders || []).forEach(r => { orderMap[r.op] = r.id; });

// Inserir OPs novas
const newOps = [...opNumbers].filter(op => !orderMap[op]).map(op => ({
  op, cliente: '', produto: '', status: 'concluido', qtd_total: 0
}));

for (let i = 0; i < newOps.length; i += 200) {
  const { data } = await sb.from('orders').insert(newOps.slice(i, i + 200)).select('id, op');
  (data || []).forEach(r => { orderMap[r.op] = r.id; });
}
console.log(`   ✅ ${Object.keys(orderMap).length} ordens`);

// Montar registros de inspeção
console.log('\n⏳ Importando inspeções...');
let batch = [], total = 0, erros = 0;

for (const row of allRows) {
  const setor = (row['SETOR'] || '').trim().toUpperCase();
  const processType = SETOR_MAP[setor];
  if (!processType) continue;

  const opKey   = (row['OP'] || '').trim();
  const opNorm  = (row['OPERADOR_NORM'] || row['OPERADOR'] || '').trim();
  const analista = (row['ANALISTA'] || '').split('/')[0].trim();

  const year  = parseInt(row['ANO']) || 2020;
  const month = parseInt(row['MES']) || 1;
  // Timestamp: dia 1 do mês às 08:00
  const created_at = new Date(year, month - 1, 1, 8, 0, 0).toISOString();

  const defects     = buildDefects(row, processType);
  const totalDef    = n(row['TOTAL_DEFEITOS']);
  const totalAmost  = n(row['TOTAL_AMOSTRAS']);
  const reprovado   = n(row['REPROVADO']);

  batch.push({
    op:            opKey,
    order_id:      orderMap[opKey] || null,
    operator_id:   operatorMap[opNorm] || null,
    analyst_id:    analystMap[analista] || null,
    machine_id:    null,
    status:        status(reprovado, totalDef),
    rework_count:  reprovado,
    samples_count: totalAmost,
    created_at,
    observations: JSON.stringify({
      process_type: processType,
      defects,
      totalDefects: totalDef,
      taxa_defeito_pct: n(row['TAXA_DEFEITO_PCT']),
      setor_original: row['SETOR'],
      is_historical: true,
    }),
  });

  if (batch.length >= BATCH_SIZE) {
    const { error } = await sb.from('inspections').insert(batch);
    if (error) { erros += batch.length; console.error(`\n❌ Lote: ${error.message}`); }
    else { total += batch.length; }
    process.stdout.write(`\r   📦 ${total + erros}/${allRows.length} processados (✅${total} ❌${erros})`);
    batch = [];
  }
}

if (batch.length > 0) {
  const { error } = await sb.from('inspections').insert(batch);
  if (error) { erros += batch.length; }
  else { total += batch.length; }
}

console.log(`\n\n🎉 Concluído!`);
console.log(`   ✅ Inseridos: ${total}`);
if (erros > 0) console.log(`   ❌ Com erro:  ${erros}`);
