import type { UserRole } from '../types';

export type NormalizedRole =
  | 'administrador'
  | 'direcao'
  | 'supervisao'
  | 'analista_qualidade'
  | 'revisao_escolha'
  | 'expedicao'
  | 'consulta_auditoria';

export type PermissionAction = 'view' | 'create' | 'edit' | 'approve' | 'admin';

export type PermissionResource =
  | 'dashboard'
  | 'management_panel'
  | 'quality_panel'
  | 'manager_reports'
  | 'quality_reports'
  | 'traceability'
  | 'op_closure'
  | 'initial_analysis'
  | 'finished_product'
  | 'pallet_inspection'
  | 'occurrences'
  | 'choice_review'
  | 'approvals'
  | 'shipping'
  | 'records'
  | 'documents'
  | 'lgpd'
  | 'admin_users'
  | 'admin_masters'
  | 'admin_nqa'
  | 'chat';

export type PermissionKey = `${PermissionResource}.${PermissionAction}`;

type RoleDefinition = {
  label: string;
  description: string;
  permissions: PermissionKey[];
};

const allActions = (resource: PermissionResource): PermissionKey[] => [
  `${resource}.view`,
  `${resource}.create`,
  `${resource}.edit`,
  `${resource}.approve`,
  `${resource}.admin`,
];

const readOnly = (resources: PermissionResource[]): PermissionKey[] =>
  resources.map(resource => `${resource}.view` as PermissionKey);

const ADMIN_RESOURCES: PermissionResource[] = [
  'dashboard',
  'management_panel',
  'quality_panel',
  'manager_reports',
  'quality_reports',
  'traceability',
  'op_closure',
  'initial_analysis',
  'finished_product',
  'pallet_inspection',
  'occurrences',
  'choice_review',
  'approvals',
  'shipping',
  'records',
  'documents',
  'lgpd',
  'admin_users',
  'admin_masters',
  'admin_nqa',
  'chat',
];

export const ROLE_DEFINITIONS: Record<NormalizedRole, RoleDefinition> = {
  administrador: {
    label: 'Administrador',
    description: 'Acesso total ao sistema, cadastros, permissões e configurações.',
    permissions: ADMIN_RESOURCES.flatMap(allActions),
  },
  direcao: {
    label: 'Direção',
    description: 'Visão gerencial, relatórios executivos, rastreabilidade e fechamento da OP.',
    permissions: [
      ...readOnly(['dashboard', 'management_panel', 'manager_reports', 'traceability', 'op_closure']),
    ],
  },
  supervisao: {
    label: 'Supervisão',
    description: 'Acompanhamento, análise, aprovações autorizadas e relatório de qualidade.',
    permissions: [
      ...readOnly(['dashboard', 'quality_panel', 'occurrences', 'traceability', 'choice_review', 'op_closure', 'quality_reports', 'records', 'chat']),
      'approvals.view',
      'occurrences.edit',
      'records.edit',
    ],
  },
  analista_qualidade: {
    label: 'Analista Qualidade',
    description: 'Lançamentos de qualidade, análises, pallets, ocorrências e consulta de OP.',
    permissions: [
      ...readOnly(['initial_analysis', 'finished_product', 'pallet_inspection', 'occurrences', 'traceability', 'records', 'chat']),
      'initial_analysis.create',
      'initial_analysis.edit',
      'initial_analysis.approve',
      'finished_product.create',
      'finished_product.edit',
      'finished_product.approve',
      'pallet_inspection.create',
      'pallet_inspection.edit',
      'pallet_inspection.approve',
      'occurrences.create',
      'occurrences.edit',
    ],
  },
  revisao_escolha: {
    label: 'Revisão/Escolha',
    description: 'Controle de escolha e revisão, quantidades revisadas e destino do material.',
    permissions: [
      ...readOnly(['choice_review', 'traceability', 'chat']),
      'choice_review.create',
      'choice_review.edit',
    ],
  },
  expedicao: {
    label: 'Expedição',
    description: 'Consulta de pallets, QR Code, expedição e rastreabilidade da OP.',
    permissions: [
      ...readOnly(['shipping', 'pallet_inspection', 'traceability', 'chat']),
      'shipping.create',
      'shipping.edit',
    ],
  },
  consulta_auditoria: {
    label: 'Consulta/Auditoria',
    description: 'Acesso somente leitura para rastreabilidade, relatórios e histórico.',
    permissions: [
      ...readOnly(['traceability', 'manager_reports', 'quality_reports', 'records', 'documents']),
    ],
  },
};

export const normalizeRole = (role: UserRole | null | undefined): NormalizedRole => {
  if (role === 'supervisor') return 'supervisao';
  if (role === 'analista') return 'analista_qualidade';
  if (role === 'auxiliar') return 'revisao_escolha';
  if (role && role in ROLE_DEFINITIONS) return role as NormalizedRole;
  return 'consulta_auditoria';
};

export const getRoleLabel = (role: UserRole | null | undefined) =>
  ROLE_DEFINITIONS[normalizeRole(role)].label;

export const hasPermission = (
  role: UserRole | null | undefined,
  resource: PermissionResource,
  action: PermissionAction = 'view',
) => ROLE_DEFINITIONS[normalizeRole(role)].permissions.includes(`${resource}.${action}` as PermissionKey);

export const hasAnyPermission = (
  role: UserRole | null | undefined,
  checks: Array<[PermissionResource, PermissionAction?]>,
) => checks.some(([resource, action]) => hasPermission(role, resource, action ?? 'view'));

export const ROLE_OPTIONS: Array<{ value: NormalizedRole; label: string; description: string }> =
  (Object.entries(ROLE_DEFINITIONS) as Array<[NormalizedRole, RoleDefinition]>).map(([value, def]) => ({
    value,
    label: def.label,
    description: def.description,
  }));

export const CRITICAL_ACTIONS: Array<{ key: string; label: string; resource: PermissionResource }> = [
  { key: 'reject_full_op', label: 'Reprovar OP inteira', resource: 'op_closure' },
  { key: 'release_restricted_op', label: 'Liberar OP com restrição', resource: 'op_closure' },
  { key: 'release_rejected_pallet', label: 'Liberar pallet reprovado', resource: 'pallet_inspection' },
  { key: 'scrap_large_quantity', label: 'Refugar grande quantidade', resource: 'occurrences' },
  { key: 'change_final_report', label: 'Alterar laudo finalizado', resource: 'quality_reports' },
  { key: 'close_op_with_divergence', label: 'Fechar OP com divergência', resource: 'op_closure' },
  { key: 'cancel_occurrence', label: 'Cancelar ocorrência', resource: 'occurrences' },
];
