import React from 'react';
import { LGPD_NOTICE_VERSION } from '../services/privacyService';

const inventory = [
  {
    title: 'Usuários e perfis',
    data: 'Nome, e-mail corporativo, papel de acesso e status.',
    purpose: 'Autenticação, autorização e responsabilidade de ações no sistema.',
    retention: 'Enquanto houver vínculo operacional ou necessidade de auditoria.',
  },
  {
    title: 'Inspeções e análises',
    data: 'OP, máquina, operador, analista, desvios, amostras, status e observações.',
    purpose: 'Rastreabilidade da qualidade, indicadores, aprovações e relatórios.',
    retention: 'Conforme política interna de qualidade e obrigações legais/contratuais.',
  },
  {
    title: 'Chat e passagem de turno',
    data: 'Autor, horário, turno, conteúdo da mensagem e confirmações de leitura.',
    purpose: 'Comunicação operacional e evidência de ciência entre turnos.',
    retention: 'Conforme necessidade operacional e auditoria interna.',
  },
  {
    title: 'Documentos',
    data: 'Nome do documento, categoria, origem, descrição, arquivo e usuário responsável pelo envio.',
    purpose: 'Disponibilização controlada de documentos internos para consulta.',
    retention: 'Enquanto o documento estiver vigente ou for necessário para histórico.',
  },
  {
    title: 'Auditoria LGPD',
    data: 'Usuário, ação, recurso acessado, data/hora e metadados mínimos.',
    purpose: 'Prestação de contas, segurança e investigação de uso indevido.',
    retention: 'Conforme política interna de segurança e auditoria.',
  },
];

const practices = [
  'Use contas individuais, sem compartilhamento de senha.',
  'Cadastre somente dados necessários para a finalidade de qualidade.',
  'Não inclua CPF, endereço, telefone pessoal ou dados sensíveis em observações e mensagens.',
  'Revise periodicamente usuários ativos, analistas, operadores e documentos.',
  'Use a exclusão/inativação quando o dado não for mais necessário para operação ou auditoria.',
  'Em caso de incidente ou acesso indevido, registre internamente e avalie comunicação conforme LGPD.',
];

export default function LgpdView() {
  return (
    <div className="mx-auto max-w-7xl animate-fade-in space-y-4 p-4 pb-20 md:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span className="size-1.5 rounded-full bg-primary" />
          Governança e privacidade
        </p>
        <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">LGPD</h1>
        <p className="mt-1 max-w-3xl text-xs font-medium text-slate-500">
          Painel interno de transparência sobre o tratamento de dados na aplicação. Versão do aviso: {LGPD_NOTICE_VERSION}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Base de uso</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
            A aplicação trata dados para execução de rotinas internas de qualidade, segurança, rastreabilidade,
            cumprimento de obrigações legais/contratuais e legítimo interesse operacional da empresa.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Controles aplicados</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
            Há autenticação, perfis de acesso, RLS no Supabase, aceite de aviso de privacidade, registro de auditoria
            para eventos sensíveis e documentos com acesso por URL assinada.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Direitos do titular</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
            Solicitações de acesso, correção, revisão ou eliminação devem ser avaliadas pela administração, preservando
            dados necessários para auditoria, qualidade, defesa de direitos e obrigações legais.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Inventário de Dados</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                <th className="py-3">Tratamento</th>
                <th className="py-3">Dados</th>
                <th className="py-3">Finalidade</th>
                <th className="py-3">Retenção</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.title} className="border-b border-slate-50 text-sm font-medium text-slate-600 last:border-0 dark:border-slate-800 dark:text-slate-300">
                  <td className="py-4 font-black uppercase text-slate-900 dark:text-white">{item.title}</td>
                  <td className="py-4 pr-4">{item.data}</td>
                  <td className="py-4 pr-4">{item.purpose}</td>
                  <td className="py-4">{item.retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Boas Práticas de Uso</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {practices.map((practice) => (
            <div key={practice} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <span className="material-symbols-outlined text-base text-primary">check_circle</span>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{practice}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
