import React from 'react';

/**
 * PageContainer — padrão de layout full-height para todas as telas.
 *
 * O <main> do AppShell já é a área rolável (h-full + overflow-y-auto). Cada tela
 * deve preencher essa área de forma consistente: largura máxima centralizada,
 * respiro lateral igual e um padding inferior que evita o conteúdo colar no fim.
 *
 * Use como raiz de uma view:
 *   return <PageContainer>...</PageContainer>;
 */
const PageContainer: React.FC<{
  children: React.ReactNode;
  /** Largura máxima do conteúdo. Default 5xl (mesma das telas atuais). */
  maxWidth?: 'none' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
  className?: string;
}> = ({ children, maxWidth = '5xl', className = '' }) => {
  const maxW =
    maxWidth === 'none' ? '' :
    maxWidth === '3xl' ? 'max-w-3xl' :
    maxWidth === '4xl' ? 'max-w-4xl' :
    maxWidth === '6xl' ? 'max-w-6xl' :
    maxWidth === '7xl' ? 'max-w-7xl' :
    'max-w-5xl';

  return (
    <div className="min-h-full w-full">
      <div className={`mx-auto w-full ${maxW} p-4 md:p-6 space-y-5 pb-10 animate-fade-in ${className}`}>
        {children}
      </div>
    </div>
  );
};

export default PageContainer;
