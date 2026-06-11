-- ============================================================================
-- TESTE_TRIGGER_031.sql — Verifica a trava de fluxo fisico da Colagem (031)
-- ============================================================================
-- Rode o arquivo INTEIRO no Supabase SQL Editor. Ele:
--   1. Cria uma OP ficticia TESTE-TRIGGER-031 com impressao + corte/vinco
--   2. Testa os 4 comportamentos do trigger
--   3. APAGA tudo no final (nao deixa residuo)
-- Resultado esperado: as 5 linhas com "OK" na coluna resultado.
-- ============================================================================

create temp table if not exists _teste_resultados (passo text, esperado text, resultado text);
truncate _teste_resultados;

do $$
declare
  v_uid uuid;
  v_err text;
begin
  select id into v_uid from auth.users limit 1;

  -- Limpeza preventiva (caso um teste anterior tenha sido interrompido)
  delete from public.acabamento_registros where op = 'TESTE-TRIGGER-031';
  delete from public.inspections where op = 'TESTE-TRIGGER-031';

  -- 1) Impressao: 100 aprovadas, 30 em escolha
  begin
    insert into public.inspections (op, status, observations)
    values ('TESTE-TRIGGER-031', 'APPROVED',
      '{"schema_version":2,"process_area":"producao_inicial","numero_rodada":1,"saldo_unidades":{"rodadas":140,"aprovadas":100,"em_escolha":30,"reprovadas":10}}');
    insert into _teste_resultados values ('1. Inspecao impressao', 'aceitar', 'OK');
  exception when others then
    insert into _teste_resultados values ('1. Inspecao impressao', 'aceitar', 'FALHOU: ' || sqlerrm);
  end;

  -- 2) Corte/Vinco: roda 100 (= aprovadas da impressao), escolha 20 → boas 80. Deve ACEITAR.
  begin
    insert into public.acabamento_registros (op, modulo, auxiliar_user_id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects)
    values ('TESTE-TRIGGER-031', 'corte_vinco', v_uid, 100, 20, 80, '{}');
    insert into _teste_resultados values ('2. C/V roda 100', 'aceitar', 'OK');
  exception when others then
    insert into _teste_resultados values ('2. C/V roda 100', 'aceitar', 'FALHOU: ' || sqlerrm);
  end;

  -- 3) Colagem: roda 90 = 80 do C/V + 10 recuperadas da escolha. Deve ACEITAR.
  --    (escolha pendente = 30 impressao + 20 C/V = 50; revisou 10 boas + 5 refugo = 15 <= 50)
  begin
    insert into public.acabamento_registros (op, modulo, auxiliar_user_id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects)
    values ('TESTE-TRIGGER-031', 'colagem', v_uid, 90, 0, 90,
      '{"boas_revisadas":10,"refugo_revisao":5,"escolha_acumulada_recebida":50,"escolha_revisada_antes_colar":1}');
    insert into _teste_resultados values ('3. Colagem 90 (80 C/V + 10 recuperadas)', 'aceitar', 'OK');
  exception when others then
    insert into _teste_resultados values ('3. Colagem 90 (80 C/V + 10 recuperadas)', 'aceitar', 'FALHOU: ' || sqlerrm);
  end;

  -- 4) Colagem extra: roda 1 com saldo esgotado. Deve BLOQUEAR.
  begin
    insert into public.acabamento_registros (op, modulo, auxiliar_user_id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects)
    values ('TESTE-TRIGGER-031', 'colagem', v_uid, 1, 0, 1, '{}');
    insert into _teste_resultados values ('4. Colagem sem saldo', 'bloquear', 'FALHOU: trigger deixou passar');
  exception when others then
    insert into _teste_resultados values ('4. Colagem sem saldo', 'bloquear', 'OK (bloqueou: ' || left(sqlerrm, 80) || ')');
  end;

  -- 5) Colagem: revisar 100 da escolha quando so restam 35 pendentes. Deve BLOQUEAR.
  begin
    insert into public.acabamento_registros (op, modulo, auxiliar_user_id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects)
    values ('TESTE-TRIGGER-031', 'colagem', v_uid, 0, 0, 0, '{"boas_revisadas":100}');
    insert into _teste_resultados values ('5. Revisao excede escolha pendente', 'bloquear', 'FALHOU: trigger deixou passar');
  exception when others then
    insert into _teste_resultados values ('5. Revisao excede escolha pendente', 'bloquear', 'OK (bloqueou: ' || left(sqlerrm, 80) || ')');
  end;

  -- Limpeza final
  delete from public.acabamento_registros where op = 'TESTE-TRIGGER-031';
  delete from public.inspections where op = 'TESTE-TRIGGER-031';
end $$;

select * from _teste_resultados;
