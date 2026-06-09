import React, { useState, useEffect, useRef } from 'react';
import { escolhaProblemasService, type EscolhaEtapa } from '../services/escolhaProblemasService';
import { useToast } from '../contexts/ToastContext';

interface Props {
  etapa: EscolhaEtapa;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Label exibido acima do campo */
  label?: string;
  /** Lista de problemas já carregada (opcional — se não passar, carrega internamente) */
  problemas?: string[];
}

const ETAPA_LABELS: Record<EscolhaEtapa, string> = {
  impressao:      'Impressão',
  corte_vinco:    'Corte e Vinco',
  colagem:        'Colagem',
  produto_acabado:'Produto Acabado',
  todos:          'Geral',
};

/**
 * Campo de motivo da escolha com:
 * - Autocomplete da lista do banco por etapa
 * - Botão "Salvar como novo problema" quando o valor não está na lista
 */
const EscolhaMotivoInput: React.FC<Props> = ({
  etapa,
  value,
  onChange,
  required = false,
  placeholder = 'Selecione ou digite o motivo...',
  disabled = false,
  label,
  problemas: problemasProp,
}) => {
  const { showToast } = useToast();
  const [problemas, setProblemas] = useState<string[]>(problemasProp ?? []);
  const [saving, setSaving] = useState(false);
  const datalistId = `escolha-motivo-${etapa}`;
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega a lista se não foi passada por prop
  useEffect(() => {
    if (problemasProp !== undefined) {
      setProblemas(problemasProp);
      return;
    }
    escolhaProblemasService.listLabels(etapa).then(setProblemas);
  }, [etapa, problemasProp]);

  // Verifica se o valor digitado não está na lista (para mostrar opção de salvar)
  const isNew = value.trim().length > 2 && !problemas.some(
    p => p.trim().toLowerCase() === value.trim().toLowerCase()
  );

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await escolhaProblemasService.create(etapa, value.trim());
      // Atualiza a lista local
      setProblemas(prev => [...prev, value.trim()]);
      showToast(`"${value.trim()}" salvo como problema de ${ETAPA_LABELS[etapa]}`, 'success');
    } catch (e: unknown) {
      // Se já existe (unique constraint), só avisa sem erro crítico
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('duplicate') || msg.includes('unique')) {
        showToast('Esse problema já está cadastrado', 'info');
        // Recarrega a lista
        escolhaProblemasService.listLabels(etapa).then(setProblemas);
      } else {
        showToast(`Erro ao salvar: ${msg}`, 'error');
      }
    }
    setSaving(false);
  };

  return (
    <div>
      {label && (
        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
          {label}
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div className="relative mt-0.5">
        <input
          ref={inputRef}
          list={datalistId}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 pr-9 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
        />
        <datalist id={datalistId}>
          {problemas.map(p => <option key={p} value={p} />)}
        </datalist>

        {/* Ícone de check quando valor está na lista */}
        {value.trim() && !isNew && (
          <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-emerald-500 pointer-events-none">
            check_circle
          </span>
        )}
      </div>

      {/* Botão de salvar novo problema */}
      {isNew && !disabled && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-950/40 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <span className="size-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          ) : (
            <span className="material-symbols-outlined text-[11px]">bookmark_add</span>
          )}
          {saving ? 'Salvando...' : `Salvar "${value.trim()}" para ${ETAPA_LABELS[etapa]}`}
        </button>
      )}
    </div>
  );
};

export default EscolhaMotivoInput;
