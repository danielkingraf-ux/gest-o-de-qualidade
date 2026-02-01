# Antigravity n8n Workflow Guide

Este arquivo contém instruções para que o Antigravity possa te ajudar a criar, otimizar e depurar fluxos de trabalho no n8n de alta qualidade.

## Ferramentas Disponíveis

Sempre utilize estas ferramentas em combinação com as solicitações do usuário para garantir que os fluxos sigam as melhores práticas e utilizem esquemas atualizados.

- **Servidor MCP do n8n**: [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp)
  - Fornece acesso a metadados de nós, propriedades e esquemas de configuração detalhados.
  - Ajuda na validação de configurações e na descoberta de novos nós.
- **Skills do n8n**: [czlonkowski/n8n-skills](https://github.com/czlonkowski/n8n-skills)
  - Conjunto de instruções especializadas para:
    - Sintaxe de expressões n8n.
    - Padrões de arquitetura de workflow (Webhooks, API, AI Agents).
    - Configuração avançada de nós e escrita de código (JS/Python) dentro do n8n.
    - Diagnóstico de erros de validação.

## Diretrizes para Criação de Workflows

1. **Modularidade**: Divida fluxos complexos em sub-fluxos (Execute Workflow) para facilitar a manutenção.
2. **Tratamento de Erros**: Implemente "Error Trigger" ou caminhos de "On Error" para garantir a resiliência.
3. **Padrões AI**: Ao usar nós de IA, siga os padrões documentados no `n8n-skills` para integração com LLMs, Vector Stores e Memória.
4. **Expressões**: Utilize a sintaxe correta do n8n (ex: `{{ $json.property }}` ou `$node["Name"].json.property`) conforme as diretrizes do Skillset.
5. **Documentação**: Adicione Notas (Post-its) dentro do workflow para explicar a lógica de cada seção.

## Como Solicitar Ajuda

- "Crie um workflow que receba um webhook do X e salve no banco de dados Y seguindo o padrão de arquitetura de API."
- "Ajude-me a depurar este erro de validação no nó HTTP Request."
- "Otimize este código JavaScript para processar os dados do nó anterior de forma mais eficiente."
